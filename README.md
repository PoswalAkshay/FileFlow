# FileFlow

FileFlow is a browser-based file-transfer application built with Node.js. It
provides a frontend for selecting and sending files, plus a small server that
stores received files locally.

## Run it

1. Install Node.js 18 or newer.
2. Open PowerShell in this folder.
3. Run:

   ```powershell
   npm start
   ```

4. Open <http://localhost:8080> on the computer running the server.
5. To connect a second PC or phone wirelessly, connect both devices to the
   same Wi-Fi network or local hotspot and open the LAN address printed by the
   server.

If another device cannot connect, allow Node.js through Windows Defender
Firewall on private networks, and make sure the network is set to **Private**.
The server listens on all local network interfaces (`0.0.0.0`).

Files sent through the interface are saved in the automatically created
`uploads` folder. The server can be stopped with `Ctrl+C`.

## Safety notes

- Use FileFlow only on a trusted private network. The local HTTP server does
  not provide authentication or encryption.
- Do not forward port `8080` to the public internet.
- Uploaded files are ignored by Git and remain on the host computer.
- If a file with the same name already exists, the server rejects the upload
  instead of overwriting the existing file.

## Features

- Drag-and-drop and multiple-file uploads
- Live current and average transfer speed
- Automatic local network address detection
- Received-file listing with file sizes and timestamps
- File downloads and removal

## How it works

- The browser sends each selected file to `POST /api/upload`.
- `GET /api/files` lists received files.
- `GET /api/network` reports the host computer's local Wi-Fi addresses.
- Received files are available from `GET /download/:name`.
- `DELETE /api/files/:name` removes a file from the shared `uploads` folder.
