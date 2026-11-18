const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector("#drop-zone");
const queue = document.querySelector("#queue");
const sendButton = document.querySelector("#send-button");
const message = document.querySelector("#message");
const receivedList = document.querySelector("#received-list");
const fileCount = document.querySelector("#file-count");
const refreshButton = document.querySelector("#refresh-button");
const networkAddresses = document.querySelector("#network-addresses");
const currentSpeed = document.querySelector("#current-speed");
const averageSpeed = document.querySelector("#average-speed");

let selectedFiles = [];

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatSpeed(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function renderQueue() {
  queue.innerHTML = selectedFiles.map((file) => `
    <div class="queue-item">
      <span class="file-icon">↗</span>
      <span class="file-name">${escapeHtml(file.name)}</span>
      <span class="file-size">${formatBytes(file.size)}</span>
    </div>
  `).join("");
  sendButton.disabled = selectedFiles.length === 0;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function chooseFiles(files) {
  selectedFiles = [...files];
  renderQueue();
  setMessage("");
}

fileInput.addEventListener("change", () => chooseFiles(fileInput.files));

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});
dropZone.addEventListener("drop", (event) => chooseFiles(event.dataTransfer.files));

sendButton.addEventListener("click", async () => {
  sendButton.disabled = true;
  setMessage("Sending files...");
  const transferStartedAt = performance.now();
  let totalBytesSent = 0;
  let lastProgressAt = transferStartedAt;
  let lastBytesSent = 0;
  try {
    for (const file of selectedFiles) {
      await uploadFile(file, (bytesSent) => {
        const now = performance.now();
        const intervalSeconds = (now - lastProgressAt) / 1000;
        const currentBytes = totalBytesSent + bytesSent;
        if (intervalSeconds >= 0.1) {
          currentSpeed.textContent = formatSpeed((currentBytes - lastBytesSent) / intervalSeconds);
          lastProgressAt = now;
          lastBytesSent = currentBytes;
        }
        const elapsedSeconds = (now - transferStartedAt) / 1000;
        averageSpeed.textContent = formatSpeed(currentBytes / Math.max(elapsedSeconds, 0.001));
      });
      totalBytesSent += file.size;
    }
    const elapsedSeconds = (performance.now() - transferStartedAt) / 1000;
    const finalAverage = totalBytesSent / Math.max(elapsedSeconds, 0.001);
    currentSpeed.textContent = formatSpeed(finalAverage);
    averageSpeed.textContent = formatSpeed(finalAverage);
    setMessage(`${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} sent successfully. Average: ${formatSpeed(finalAverage)}.`);
    selectedFiles = [];
    fileInput.value = "";
    renderQueue();
    loadReceivedFiles();
  } catch (error) {
    setMessage(error.message, true);
    sendButton.disabled = selectedFiles.length === 0;
  }
});

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size);
        resolve();
      } else {
        reject(new Error(`Could not send ${file.name}`));
      }
    });
    request.addEventListener("error", () => reject(new Error(`Could not send ${file.name}`)));
    request.send(file);
  });
}

async function loadReceivedFiles() {
  try {
    const response = await fetch("/api/files");
    const data = await response.json();
    fileCount.textContent = data.files.length;
    receivedList.innerHTML = data.files.length ? data.files.map((file) => `
      <div class="file-item">
        <span class="file-icon">↓</span>
        <span class="file-meta">
          <span class="file-name">${escapeHtml(file.name)}</span>
          <span class="file-date">${formatBytes(file.size)} · ${new Date(file.receivedAt).toLocaleString()}</span>
        </span>
        <a class="file-action download-action" href="${file.downloadUrl}">DOWNLOAD</a>
        <button class="file-action delete-action" type="button" data-file-name="${escapeHtml(file.name)}">REMOVE</button>
      </div>
    `).join("") : '<div class="empty-state">No files have been received yet.</div>';
    receivedList.querySelectorAll(".delete-action").forEach((button) => {
      button.addEventListener("click", () => removeFile(button.dataset.fileName));
    });
  } catch {
    receivedList.innerHTML = '<div class="empty-state">Could not load received files.</div>';
  }
}

async function removeFile(fileName) {
  if (!confirm(`Remove "${fileName}" from the shared file list?`)) return;
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(fileName)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("The file could not be removed.");
    setMessage(`${fileName} was removed from the server.`);
    loadReceivedFiles();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function loadNetworkAddresses() {
  try {
    const response = await fetch("/api/network");
    const data = await response.json();
    networkAddresses.innerHTML = data.addresses.length
      ? data.addresses.map((address) => `<code>${escapeHtml(address)}</code>`).join("")
      : "<span>No Wi-Fi address found. Check that this computer is connected to a network.</span>";
  } catch {
    networkAddresses.textContent = "Could not detect the network address.";
  }
}

refreshButton.addEventListener("click", loadReceivedFiles);
loadReceivedFiles();
loadNetworkAddresses();
