# Web Remote

A simple web-based remote control interface.

## Try it out

You can access the hosted version here: https://nicsure.github.io/webremote_nicfw880/

## Host it yourself

Use these steps to deploy the remote on your own webserver.

1. Copy the static files (`index.html`, `styles.css`, `app.js`, and `protocol.md`) to your webserver's document root.
2. Ensure the webserver serves `index.html` as the default document for the directory.
3. Serve the files over HTTPS if the remote needs access to modern browser features or must be used from secure contexts.
4. Open the hosted URL in a browser to load the remote.

### Optional configuration

- If you need to customize the remote, edit `app.js` and `styles.css` before uploading them.
- If you're integrating with a backend, update any endpoint URLs in `app.js` to point at your server.
