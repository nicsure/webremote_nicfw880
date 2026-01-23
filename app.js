const START_SESSION = new Uint8Array([0xaa, 0x51]);
const EXIT_SESSION = new Uint8Array([0x52]);
const PING_BYTE = 0xaa;

const FONT_METRICS = {
  0: { width: 8, height: 8, size: 8 },
  1: { width: 8, height: 16, size: 16 },
  2: { width: 16, height: 16, size: 16 },
  3: { width: 16, height: 24, size: 24 },
  4: { width: 24, height: 24, size: 24 },
  5: { width: 24, height: 32, size: 32 },
  6: { width: 16, height: 16, size: 16 },
};

const DISPLAY_SCALE = 2;

const SYMBOL_MAP = {
  32: " ",
  33: "🔒",
  34: "🆔",
  35: "💬",
  36: "🔍",
  37: "⏸",
  38: "▲",
  39: "🔑",
  40: "🔄",
  41: "↑",
  42: "↓",
  43: "←",
  44: "→",
  45: "−",
  46: "+",
  47: "⚠",
  48: "🅧🅑",
  49: "🌙",
  50: "🌧",
  51: "♪",
  52: "⚡",
  53: "●",
  54: "📡",
  55: "📶",
  56: "🧭",
  57: "🧭",
  58: "🔇",
};

const connectButton = document.getElementById("connectButton");
const disconnectButton = document.getElementById("disconnectButton");
const startButton = document.getElementById("startButton");
const exitButton = document.getElementById("exitButton");
const clearButton = document.getElementById("clearButton");
const connectionStatus = document.getElementById("connectionStatus");
const pingStatus = document.getElementById("pingStatus");
const checksumStatus = document.getElementById("checksumStatus");
const ledDot = document.getElementById("ledDot");
const canvas = document.getElementById("display");
const ctx = canvas.getContext("2d");

let port = null;
let reader = null;
let writer = null;
let pingInterval = null;
let lastPingReply = null;
let sessionActive = false;
let sessionStarting = false;
let sessionStartTime = null;

function setStatus(text) {
  connectionStatus.textContent = text;
}

function setChecksumStatus(text, ok = true) {
  checksumStatus.textContent = text;
  checksumStatus.style.color = ok ? "#1c1e26" : "#b00020";
}

function updatePingStatus() {
  if (!lastPingReply) {
    pingStatus.textContent = "Ping: --";
    return;
  }
  const delta = Math.round((Date.now() - lastPingReply) / 100) / 10;
  pingStatus.textContent = `Ping: ${delta.toFixed(1)}s`;
}

function rgb565ToHex(value) {
  const r = Math.round(((value >> 11) & 0x1f) * (255 / 31));
  const g = Math.round(((value >> 5) & 0x3f) * (255 / 63));
  const b = Math.round((value & 0x1f) * (255 / 31));
  return `rgb(${r}, ${g}, ${b})`;
}

function computeChecksum(bytes) {
  let sum = 0;
  for (const byte of bytes) {
    sum = (sum + byte) & 0xff;
  }
  return sum;
}

function clearDisplay() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawText({ x, y, font, background, foreground, text }) {
  const metrics = FONT_METRICS[font] ?? FONT_METRICS[0];
  const width = metrics.width * text.length * DISPLAY_SCALE;
  const height = metrics.height * DISPLAY_SCALE;
  ctx.fillStyle = rgb565ToHex(background);
  ctx.fillRect(x, y, width, height);
  ctx.font = `${metrics.size * DISPLAY_SCALE}px monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = rgb565ToHex(foreground);

  if (font === 6) {
    [...text].forEach((char, index) => {
      const code = char.charCodeAt(0);
      const symbol = SYMBOL_MAP[code] ?? char;
      ctx.fillText(symbol, x + index * metrics.width * DISPLAY_SCALE, y);
    });
    return;
  }

  ctx.fillText(text, x, y);
}

function drawRect({ x, y, width, height, color }) {
  ctx.fillStyle = rgb565ToHex(color);
  ctx.fillRect(x, y, width, height);
}

function updateLed(status) {
  const colors = {
    0x00: "#1c1e26",
    0x01: "#e53935",
    0x02: "#43a047",
    0x03: "#fbc02d",
  };
  ledDot.style.background = colors[status] ?? "#1c1e26";
}

class PacketParser {
  constructor(onPacket, onPing) {
    this.buffer = [];
    this.onPacket = onPacket;
    this.onPing = onPing;
  }

  feed(chunk) {
    for (const byte of chunk) {
      if (byte === PING_BYTE && this.buffer.length === 0) {
        this.onPing();
        continue;
      }
      this.buffer.push(byte);
      this.process();
    }
  }

  process() {
    while (this.buffer.length > 0) {
      if (this.buffer[0] !== 0x55) {
        this.buffer.shift();
        continue;
      }
      if (this.buffer.length < 2) {
        return;
      }
      const type = this.buffer[1];
      if (type === 0x01) {
        const length = 11;
        if (this.buffer.length < length) {
          return;
        }
        const packet = this.buffer.slice(0, length);
        this.buffer.splice(0, length);
        this.onPacket(packet);
        continue;
      }
      if (type === 0x03) {
        const length = 4;
        if (this.buffer.length < length) {
          return;
        }
        const packet = this.buffer.slice(0, length);
        this.buffer.splice(0, length);
        this.onPacket(packet);
        continue;
      }
      if (type === 0x02) {
        const headerLength = 10;
        if (this.buffer.length < headerLength + 1) {
          return;
        }
        const terminatorIndex = this.buffer.indexOf(0x00, headerLength);
        if (terminatorIndex === -1) {
          return;
        }
        const length = terminatorIndex + 2;
        if (this.buffer.length < length) {
          return;
        }
        const packet = this.buffer.slice(0, length);
        this.buffer.splice(0, length);
        this.onPacket(packet);
        continue;
      }
      this.buffer.shift();
    }
  }
}

function parsePacket(packet) {
  const checksum = packet[packet.length - 1];
  const computed = computeChecksum(packet.slice(0, -1));
  const checksumOk = checksum === computed;
  setChecksumStatus(`Checksum: ${checksumOk ? "OK" : "BAD"}`, checksumOk);
  if (!checksumOk) {
    return;
  }

  const type = packet[1];
  if (type === 0x01) {
    drawRect({
      x: packet[2] * DISPLAY_SCALE,
      y: (packet[3] | (packet[4] << 8)) * DISPLAY_SCALE,
      width: packet[5] * DISPLAY_SCALE,
      height: (packet[6] | (packet[7] << 8)) * DISPLAY_SCALE,
      color: packet[8] | (packet[9] << 8),
    });
    return;
  }
  if (type === 0x02) {
    const textBytes = packet.slice(10, -1);
    const text = new TextDecoder().decode(Uint8Array.from(textBytes)).replace(/\u0000$/, "");
    drawText({
      x: packet[2] * DISPLAY_SCALE,
      y: (packet[3] | (packet[4] << 8)) * DISPLAY_SCALE,
      font: packet[5],
      background: packet[6] | (packet[7] << 8),
      foreground: packet[8] | (packet[9] << 8),
      text,
    });
    return;
  }
  if (type === 0x03) {
    updateLed(packet[2]);
  }
}

async function connect() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 38400 });
    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    setStatus("Connected");
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    updateSessionButtons();
    readLoop();
  } catch (error) {
    console.error(error);
    setStatus("Connection failed");
  }
}

async function disconnect() {
  stopPing();
  if (reader) {
    await reader.cancel();
    reader.releaseLock();
    reader = null;
  }
  if (writer) {
    writer.releaseLock();
    writer = null;
  }
  if (port) {
    await port.close();
    port = null;
  }
  endSession();
  connectButton.disabled = false;
  disconnectButton.disabled = true;
  updateSessionButtons();
  setStatus("Disconnected");
}

async function sendBytes(bytes) {
  if (!writer) return;
  await writer.write(bytes);
}

function startPing() {
  stopPing();
  pingInterval = setInterval(async () => {
    try {
      await sendBytes(Uint8Array.from([PING_BYTE]));
    } catch (error) {
      console.error(error);
    }
    updatePingStatus();
    const now = Date.now();
    if (sessionStarting && sessionStartTime && now - sessionStartTime > 5000 && !lastPingReply) {
      await sendExitSession();
      endSession("Ping timeout");
      return;
    }
    if (sessionActive && lastPingReply && now - lastPingReply > 5000) {
      await sendExitSession();
      endSession("Ping timeout");
    }
  }, 1000);
}

function stopPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  lastPingReply = null;
  updatePingStatus();
}

function updateSessionButtons() {
  const connected = Boolean(port);
  startButton.disabled = !connected || sessionActive || sessionStarting;
  exitButton.disabled = !connected || !sessionActive;
}

function beginSession() {
  sessionStarting = true;
  sessionActive = false;
  sessionStartTime = Date.now();
  lastPingReply = null;
  updatePingStatus();
  updateSessionButtons();
  startPing();
}

function endSession(statusMessage) {
  sessionStarting = false;
  sessionActive = false;
  sessionStartTime = null;
  lastPingReply = null;
  stopPing();
  updatePingStatus();
  updateSessionButtons();
  if (statusMessage) {
    setStatus(statusMessage);
  }
}

async function sendExitSession() {
  try {
    await sendBytes(EXIT_SESSION);
  } catch (error) {
    console.error(error);
  }
}

async function readLoop() {
  const parser = new PacketParser(parsePacket, () => {
    lastPingReply = Date.now();
    updatePingStatus();
    if (sessionStarting) {
      sessionStarting = false;
      sessionActive = true;
      updateSessionButtons();
    }
  });

  while (port && reader) {
    try {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        parser.feed(value);
      }
    } catch (error) {
      console.error(error);
      break;
    }
  }
}

function handleKeyPress(event) {
  if (!sessionActive) return;
  const key = event.currentTarget.dataset.key;
  if (!key) return;
  const value = Number(key);
  sendBytes(Uint8Array.from([value]));
}

function handleKeyRelease(event) {
  if (!sessionActive) return;
  const release = event.currentTarget.dataset.release;
  if (!release) return;
  const value = Number(release);
  sendBytes(Uint8Array.from([value]));
}

connectButton.addEventListener("click", connect);
disconnectButton.addEventListener("click", disconnect);
startButton.addEventListener("click", () => {
  beginSession();
  sendBytes(START_SESSION);
});
exitButton.addEventListener("click", () => {
  sendBytes(EXIT_SESSION);
  endSession("Session ended");
});
clearButton.addEventListener("click", clearDisplay);

document.querySelectorAll(".key").forEach((button) => {
  button.addEventListener("pointerdown", handleKeyPress);
  button.addEventListener("pointerup", handleKeyRelease);
  button.addEventListener("pointerleave", handleKeyRelease);
});

clearDisplay();
setChecksumStatus("Checksum: --");
updatePingStatus();
