# Install Gather v0.1

## Download and extract

Use **Code → Download ZIP** on the GitHub repository, then extract it. Keep the extracted folder somewhere permanent. The prepared Chrome extension is in its `extension/` subfolder.

## Load the Chrome extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the extracted project's **extension** folder, not the parent folder or ZIP file.
5. Pin **Gather v0.1** using Chrome's Extensions menu.
6. Open Gather in the toolbar and choose **Open your collection**.
7. Visit a normal webpage and press **Alt + Shift + S** to save its snapshot and readable text. You can also save from the toolbar popup.

Change a conflicting shortcut at `chrome://extensions/shortcuts`. Keep the installed folder at the same path.

## Start the local app and services

Install Python 3.10 or later from [python.org](https://www.python.org/downloads/). On Windows, enable **Add Python to PATH** in the installer. No Python packages are required.

Open a terminal in the project folder and run:

```powershell
python server.py
```

Use `python3 server.py` if that is your system's Python command. On Windows, `py server.py` is another option when the Python launcher is installed.

Open http://localhost:4173. Keep the terminal running for Watchlist polling, folder backups, and extension recovery syncing. Press **Ctrl + C** to stop it. If the port is occupied, use `python server.py --port 4174`.

Ordinary Chrome capture can run without the server. The localhost app and Chrome extension have separate collections. Open the extension's own collection to see pages captured through Chrome.

## Import Chrome bookmarks

1. Open Gather's extension popup and select **Import bookmarks**.
2. Choose **Load Chrome bookmarks** and allow bookmark access.
3. Select websites, or use **Only** beside a website. You can also filter by bookmark folder.
4. Leave **Capture page snapshots & recognize topics** enabled to create previews.
5. Select **Import selected bookmarks** and allow requested website access if you want captures.
6. Follow the queue progress. Pause, resume, or retry failed pages from the importer.

Gather saves its own copies without changing Chrome bookmarks. Snapshots use an inactive background tab. Chrome can display a debugging notice while the queue captures pages.

## Enable a companion

In the extension popup, expand **Choose your companion**, choose a robot, cat, or dog, and select **Enable companion**. Allow optional website access if prompted. Click the companion on a webpage to save it. Chrome internal pages and other restricted pages do not support companions.

## Set up backups

Start the Python server. Open **Collection settings → Backups → Choose folder**. Folder selection currently uses a Windows picker. Select **Back up now** to verify the first backup. Automatic backups run every 12 hours while the computer and server are running; an overdue backup runs when the server starts again.

The extension syncs to the local server while Chrome runs. Check **Reinstall protection** before removing it. Use **Export library + screenshots** for a separate recovery copy.

## Update an existing installation

Keep the existing extension folder at the same path. Update its files, then click **Reload** on its card at `chrome://extensions`. Reopen its collection tab, or use **Reconnect library** if shown. Avoid removing the extension, which can delete its browser data.

After editing the source, regenerate the prepared folder on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-extension.ps1
```

Then reload the extension in Chrome.

## Troubleshooting

**Chrome rejects `__pycache__` or cannot find the manifest:** Load the `extension/` folder, not the project root.

**Imported pages are missing:** Choose **Open your collection** from Gather's Chrome popup. The localhost app has a separate collection. Reconnect a collection tab left open during an extension reload.

**A preview says No snapshot yet:** In the extension's Cover Flow, choose **Capture missing previews**, or open the page and capture it with the shortcut. Login screens, bot protection, and Chrome restrictions can prevent capture.

**Bookmark import reports missing manifest permissions:** Rebuild if needed, reload the existing extension, and reopen its collection. Chrome may still have an older manifest loaded.

**The companion is missing:** Use **Show companion** in its picker. Check that it is enabled and has website access. Refresh the page if you hid it with the small ×.

**A keyword does not find a page:** Capture it or use **Read page again**. Body-text search needs a successful readable-text capture. Text inside an image is not indexed.

**Backups or watches do not run:** Keep `python server.py` running. A static preview server cannot run these services. Check the app for connection status and errors.

See [the full user guide](USER-GUIDE.md) for workflows, capture behavior, storage, and recovery details.
