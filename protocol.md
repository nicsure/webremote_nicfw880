# Remote Protocol Overview

Remote Mode uses a **datagram-based packet protocol**. Communication is **unacknowledged** (except for PING), meaning packets are not guaranteed to arrive and are not retried.  
Communication is via serial interface at 38,400 baud.

The radio's display is **240x320 pixels** in a **portrait** orientation.
Implementations should ideally keep the key controls, display mirror and any other connection based controls all on the screen together without having to scroll. 

Once Remote Mode is active:

- The radio **no longer responds** to normal serial commands
- Storage read/write operations are disabled
- Only Remote protocol packets are processed

---

# Session Control

## START (HOST → RADIO)

Begins a remote control session.

**Bytes:** `0xAA, 0x51`

## PING (Bidirectional)

To keep the remote session alive, the HOST should send a ping byte **once per second**.

**Bytes:** `0xAA`

The RADIO replies with the same byte (`0xAA`). This keeps both directions active and prevents timeouts.

- If the HOST stops sending pings, the RADIO will terminate Remote Mode after a few seconds.
- The HOST should terminate Remote Mode if ping replies from the RADIO stop arriving.



## EXIT (HOST → RADIO)

Terminates Remote Mode and returns the radio to normal operation.

**Byte:** `0x52`

---

# Display Update Packets (RADIO → HOST)

These packets instruct the HOST to update the remote display.

## TEXT Packet

Instructs the HOST to draw a text string.

| Field | Description |
|---|---|
| `0x55` | Packet signature |
| `0x02` | Packet type |
| 1 byte (unsigned) | X coordinate |
| 2 bytes (unsigned, little-endian) | Y coordinate |
| 1 byte (unsigned) | Font number * |
| 2 bytes (unsigned, little-endian) | Background color (RGB565) |
| 2 bytes (unsigned, little-endian) | Foreground color (RGB565) |
| Variable | Null-terminated ASCII text |
| 1 byte (unsigned) | Additive packet checksum |

### Fonts  
Different font sizes and symbols must be implemented. All fonts are monospaced. They are numbered as follows:
- 0 : 8x8 ASCII Font
- 1 : 8x16 ASCII Font
- 2 : 16x16 ASCII Font
- 3 : 16x24 ASCII Font
- 4 : 24x24 ASCII Font
- 5 : 24x32 ASCII Font
- 6 : 16x16 Symbol Font
  - See table below

### Symbol Font
| ASCII Code | Symbol |
|---|---|
| 32 | Regular Space |
| 33 | Padlock |
| 34 | PTT-ID Icon |
| 35 | VOX Icon (Speech Bubble) |
| 36 | Scanning Icon |
| 37 | Pause Icon |
| 38 | UP Chevron |
| 39 | Key Icon |
| 40 | Circular Arrow |
| 41 | UP Arrow |
| 42 | DOWN Arrow |
| 43 | LEFT Arrow |
| 44 | RIGHT Arrow |
| 45 | Minus Symbol ( - ) |
| 46 | Plus Symbol ( + ) |
| 47 | Warning Triangle |
| 48 | Cross Band Repeater Icon (XB) |
| 49 | Crescent Moon |
| 50 | Rain Cloud |
| 51 | Music Note |
| 52 | Charging Icon (Lightning Bolt) |
| 53 | Filled Circle |
| 54 | GPS Not Locked Icon |
| 55 | GPS Locked Icon |
| 56 | Compass with no needle |
| 57 | Compass with needle |
| 58 | Mute Icon |



## RECT Packet

Instructs the HOST to draw a filled rectangle.

| Field | Description |
|---|---|
| `0x55` | Packet signature |
| `0x01` | Packet type |
| 1 byte (unsigned) | X coordinate |
| 2 bytes (unsigned, little-endian) | Y coordinate |
| 1 byte (unsigned) | Rectangle width |
| 2 bytes (unsigned, little-endian) | Rectangle height |
| 2 bytes (unsigned, little-endian) | Rectangle color (RGB565) |
| 1 byte (unsigned) | Additive packet checksum |

## LED Packet

Updates the graphical representation of the radio’s status LED.

| Field | Description |
|---|---|
| `0x55` | Packet signature |
| `0x03` | Packet type |
| 1 byte (unsigned) | LED status * |
| 1 byte (unsigned) | Additive packet checksum |

* LED Status Values
  - `0x00` : LED off (black)
  - `0x01` : Red LED
  - `0x02` : Green LED
  - `0x03` : Green + Red (yellow)

---

# Keypad

Implementations should provide controls to mirror the radio's physical keypad. Ideally these controls should be arranged in a similar way to the radio itself.

| Side Buttons | 1st Column | 2nd Column | 3rd Column |
|---|---|---|---|
| PTT | Emerg | Up | |
| PTT | Green | Down | Red |
| PTT |  |  |  |
| S1 | 1 | 2 | 3 |
| S1 | 4 | 5 | 6 |
| S2 | 7 | 8 | 9 |
| S2 | `*` | 0 | `#` |

Note that PTT spans three rows and S1,S2 span two rows.

Communicating key press and release events is detailed below.

---

# Key Input Packets (HOST → RADIO)

These single-byte packets simulate keypad and button events on the radio. The HOST should send pressed packets when the user presses a control and release packets when the user releases the control. PTT has its own release event packet (0xFE), every other key shares a release event packet (0xFF)

| Value | Action |
|---|---|
| `0x00` | Keypad 1 pressed |
| `0x01` | Keypad 4 pressed |
| `0x02` | Keypad 7 pressed |
| `0x03` | `*` pressed |
| `0x04` | Keypad 2 pressed |
| `0x05` | Keypad 5 pressed |
| `0x06` | Keypad 8 pressed |
| `0x07` | Keypad 0 pressed |
| `0x08` | Keypad 3 pressed |
| `0x09` | Keypad 6 pressed |
| `0x0A` | Keypad 9 pressed |
| `0x0B` | `#` pressed |
| `0x0C` | GREEN pressed |
| `0x0D` | UP pressed |
| `0x0E` | DOWN pressed |
| `0x0F` | RED pressed |
| `0x10` | Side button S1 pressed |
| `0x11` | Side button S2 pressed |
| `0x12` | Emergency button pressed |
| `0x13` | PTT pressed |
| `0xFE` | PTT released |
| `0xFF` | Any other key released (except PTT) |

---

# Packet Checksums

The last byte of all display packets sent by the radio is a checksum. The checksum is calculated by adding every byte of the packet other than the checksum byte itself. The sum is an 8-bit additive checksum, so it wraps at 0xFF. The host should calculate this checksum and check it matches the checksum byte sent at the end of the packet.

### **For Example:**  
Here's the Text Packet that draws the `Battery Charging` icon.

| Field | Description |
|---|---|
| `0x55` | Packet signature = 85 |
| `0x02` | Packet type = 2 |
| `0xB7`| X coordinate = 183 |
| `0x27` `0x00` | Y coordinate = 39, 0 |
| `0x06` | Font number = 6 |
| `0x00` `0x00` | Background color black = 0, 0 |
| `0x1F` `0x00` | Foreground color blue = 31, 0 |
| `0x34` `0x00` | Charging icon  = 52, 0 |
| `0x8E` | checksum = 142 |

If we manually check this, add them all together  
0x55 + 0x02 + 0xB7 + 0x27 + 0x06 + 0x1F + 0x34 = 0x18E  
0x18E % 0x100 = 0x8E : CORRECT

Implementations of this protocol should use the above sample packet data to test the checksum functionality is correct.
