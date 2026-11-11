# Gather v0.1 user guide

First public version: **v0.1**. The app header, browser tab, and Chrome extension display this release name. Chrome retains the existing internal build number (`0.9.1`); its displayed `version_name` is `0.1`.

A private, local-first discovery library with a freeform canvas, a compact list, connected ideation maps, and a local page watcher. Python and a browser are enough; no build, account, or AI-provider key is required.

## Run

Run `python server.py` from this folder, then open http://localhost:4173. Keep this process running for page reading and scheduled watch checks. If a static preview already occupies port 4173, run `python server.py --port 4174` alongside it; the existing preview will find the local service. Port 4175 is an additional fallback.

## Library

Paste a URL into **Save link**. Gather reads its title, description, headings, and a bounded sample of text to infer its subject and tags. The first grouping is the website (GitHub, Reddit, LinkedIn, or the domain); the topic is a separate subcategory, such as Video generation or Image generation. Repository/Post is a page-type label. Existing saves receive website labels without changing their saved canvas positions.

Use the website dropdown, topic filter, and search together. Switch between **Canvas**, **List**, and **Cover Flow** at any time. List and Cover Flow support newest/oldest/title sorting. Your canvas arrangement is preserved. Select a save for details, editing, favorites, **Watch this page**, or **Use in a workflow**.

Search recognizes website names independently of cached page labels: `reddit` and the common spelling `reditt` both find Reddit links; `git hub` finds GitHub. Combine them with subjects, such as `reditt video`. Explicit website searches clear conflicting Library filters so matching source links are not hidden. Ordinary searches also include notes, tags, and recognized model names.

In List view, the **Thumbnails** selector offers Small, Medium, and Large sizes and remembers your choice. Click a snapshot thumbnail to open the full-size reader. The reader supports zoom, 100% original size, and Fit, with scrolling when enlarged.

Topics describe a concrete purpose: **Image-to-video models**, **Text-to-video models**, **Text-to-image models**, **Image editing & inpainting**, **VFX & compositing**, **Local model runtimes**, and similar subjects. A model used by a tool is displayed separately when its name is recognized (for example, LTX-2.5). Generic old labels are upgraded from saved metadata, while manually edited topics are preserved. Use **Read page again** when an older save needs the full page analyzed again. A bounded local sample of headings and readable text is kept so future topic upgrades can use the captured context.

### Cover Flow and snapshots

Cover Flow presents saved pages as animated, tilted covers. Use the previous/next buttons, arrow keys, slider, or a horizontal swipe. The selected cover shows its title, description, website, specific topic, and recognized model names. Reduced-motion preferences disable the animation.

Cover pages are displayed at reading size, showing the top portion of a snapshot rather than shrinking the whole page into a small cover. Click the selected snapshot or **Read snapshot** for the full image, including zoom controls.

Chrome's **Alt+Shift+S** capture automatically attaches a real visible-page snapshot. Existing captures appear in all three views. For a save without a snapshot, Cover Flow explicitly shows **No snapshot yet**. Open the original page and capture it through the extension, or choose **Attach a snip** to add a PNG, JPEG, or WebP image. You can also use Windows **Win+Shift+S** and paste the image into Cover Flow. Images are resized to a maximum width of 1440 pixels before local storage. A pasted URL alone cannot capture a remote page's pixels in the web app; it retains its title and summary until a screenshot is supplied.

On the canvas, drag tiles to move, select then drag the bottom-right handle to resize, scroll to zoom, and drag blank space or hold Space to pan. V selects, H pans, F fits, and / focuses search. Arrow keys move a focused tile; arrow keys on a resize handle resize it. Focus mode hides the interface; Escape exits.

Topic recognition uses deterministic local rules, not a language model. Ambiguous or unreadable pages are flagged for review. Bot protection, login requirements, and JavaScript-only sites can limit what the local reader sees. Details remain editable, and **Read page again** retries recognition.

## Chrome capture

1. Run `powershell -ExecutionPolicy Bypass -File .\build-extension.ps1` from this project folder to prepare the Chrome package.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**. Select **`Gather/extension`**, not the project root. The root contains Python caches that Chrome rejects. After source changes, run the packaging command again and reload the extension.
3. On a website, press **Alt+Shift+S** to capture the visible page and save its readable content. A brief border flash and a completion message confirm capture.
4. Open the Gather popup and choose **Open your collection** to view captures. The popup's Save action also captures the current page; pasted destination links are read without a screenshot.

Change the shortcut in `chrome://extensions/shortcuts` if it conflicts with another command. Capture uses [Chrome commands](https://developer.chrome.com/docs/extensions/reference/api/commands) and active-tab access. Restricted pages may permit only text capture or prevent capture entirely. Captures contain the visible viewport, not the full scrollable page. Selected text becomes the capture's note. Capturing an existing URL refreshes its snapshot without duplicating it.

Right-click **Save link to Gather** reads the link destination and retains the source page URL. Reading a different website may ask for optional per-site access. Declining still saves the link with a review state. The extension needs optional localhost access to use the local Watchlist service; ordinary capture does not need the server.

## Import Chrome bookmarks and capture snapshots

Reload the prepared extension in `chrome://extensions`. Open its popup and choose **Import bookmarks**, or open its collection and select **Collection settings → Import Chrome bookmarks**. The localhost app shows the importer’s instructions; reading Chrome bookmarks and capturing pages runs in the installed extension.

1. Choose **Load Chrome bookmarks** and allow bookmark access. Bookmarks are grouped by website with counts of unique links. Select several sites, or click **Only** beside GitHub, Reddit, YouTube, or another site to import just that website. Use the website search to find a domain. **Filter by bookmark folder** optionally narrows the selection further: selecting a folder includes its descendants, and unchecking a child removes it from a selected parent. Both website and folder choices apply to preview counts, imported links, and the snapshot queue.
2. Review the counts of new links, existing saves, and missing previews. Repeated URLs are combined after tracking-parameter removal. Only HTTP/HTTPS links without embedded credentials are imported; browser-internal, file, and script links are skipped.
3. Leave **Capture page snapshots & recognize topics** checked, or turn it off for a links-only import. Choose **Import selected bookmarks**. Chrome asks for optional website access for snapshots. Expanded local storage is declared by the extension for larger collections and is not requested again by the import button.
4. All selected links are saved to the extension library first. An inactive, muted background tab is reused for captures. Your active page and window are not changed. Chrome may show its debugging notice during capture. Capture waits for loading plus a short render period, with bounded image/font settling. Snapshots show the viewport at import time, not a historical copy or a full-page archive.

Original folder paths are stored in `bookmarkFolders`, original bookmark titles in `bookmarkTitles`, and folder names become tags. All are searchable, including custom bookmark titles after page enrichment. Main categories continue to group by website. Existing titles, notes, favorites, manual topics, and existing snapshots are preserved during initial import; successful enrichment updates page details while retaining folder tags, notes, and manual topics. Importing again adds new bookmarks without duplicating earlier saves and can capture previously missing previews. Original Chrome bookmarks are never changed or deleted.

The saved queue offers **Pause**, **Resume**, **Retry failed pages**, and **Stop queue**. Stopping keeps every imported library entry. Failed captures retain their links and appear under **Pages needing review** with an original-page link. Login/bot pages, empty content, timeouts, screenshot errors, and redirects to a different normalized URL are not recorded as successful captures. Redirects are deliberately left for manual review, including HTTP-to-HTTPS redirects. If the capture tab closes or moves, the remaining work pauses. If Chrome or the service worker restarts, interrupted work becomes paused and can be explicitly resumed. Keep Chrome running during capture; this is a local browser job, not a cloud process. Snapshot progress lives in extension storage separately from the library; library entries and completed snapshots are included in normal Gather backups.

The implementation uses [Chrome bookmarks](https://developer.chrome.com/docs/extensions/reference/api/bookmarks), [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [local storage](https://developer.chrome.com/docs/extensions/reference/api/storage), and [window-specific viewport capture](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab). Imports are limited to 10,000 selected unique links per batch; snapshots consume disk space. The current folder-backup upload and collection-restore limit is 500 MB, so collections above that size exceed the current folder-backup and restore limit.

## Floating companion

Reload the prepared `extension` folder in Chrome after an update. Open the Gather toolbar popup, expand **Choose your companion**, pick **Pip** (robot), **Mochi** (cat), or **Scout** (dog), then choose **Enable companion**. If it is already enabled, **Show companion** reconnects it to open pages. The same picker is available inside the extension’s collection under **Collection settings → Your companion**. The regular localhost app offers the character preview; website injection runs through the installed Chrome extension.

Enabling asks Chrome for optional website access. The companion appears at the bottom right of ordinary HTTP/HTTPS pages, including pages already open. Change it to the bottom left, disable idle animations, or turn it off in the picker. The small × hides it for the current page until a refresh. Chrome internal pages, the Chrome Web Store, and other restricted pages do not support injection. File URLs are not injected.

Click the companion to capture the current viewport and readable page content, categorize it, and save it directly into the **extension’s library**. A brief save animation and message confirm the website and topic. Capturing an existing URL refreshes that entry without creating a duplicate. The companion and its feedback are hidden from the screenshot and excluded from page text. If you change tabs or navigate during capture, Gather rejects the capture rather than attaching the wrong preview. Capture restrictions can leave a text-only save, which the confirmation identifies.

The companion restores itself if a website replaces its page content. Screenshot hiding expires after eight seconds even if capture is interrupted. Choosing a pet in another open settings window keeps your latest enabled preference.

Your companion makes a short wave or bounce every 3–5 minutes while the page is visible. It never saves automatically. Reduced-motion preferences suppress movement; the motion checkbox also turns off idle animations. Disabling unregisters the persistent page script, and settings changes update companions in existing tabs. No external artwork, animation libraries, or remote services are used.

The feature uses Chrome’s [persistent content-script registration](https://developer.chrome.com/docs/extensions/reference/api/scripting) and [viewport capture API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab). The broad optional permission is needed for a persistent button and screenshot capture from a click inside a web page; ordinary toolbar/shortcut capture remains available without enabling the companion.

## Ideation

Create a workflow, add tools from the searchable Library drawer, and give each step a name and purpose. Add plain steps for tasks without a tool. Use **Connect steps** to draw labeled directional arrows; branches and alternate paths are supported. Drag nodes to arrange them, use arrow keys on a focused node, and choose **Fit map** to see the map together.

Each tool node links back to its Library entry, but its purpose and position belong to the workflow. The same tool can appear in multiple steps or workflows. Removing a workflow node keeps the Library save. Removing a Library save leaves the step's name and purpose in the map. Workflows are visual plans; they do not execute the connected tools.

The previous Library project boards are still available for simple reference collections. Ideation is the separate workspace for connected workflow maps.

## Watchlist and Updates

Watch a specific public page, choose an interval (15 minutes, hourly, every 6 hours, or daily), and optionally provide comma-separated keywords. The first successful read establishes a baseline without alerting. Later substantial changes to readable text create an update; keyword filters require a match near changed content. Repeated identical changes, small numeric noise, and HTML-only changes are suppressed. Check now, pause/resume, and remove controls are available.

The local server performs scheduled checks even when the Gather tab is closed, as long as the computer and server remain running. This is polling, not real-time monitoring. Public pages only: login-protected or bot-blocked pages may be unavailable. Watch a repository's `/releases` page for release-page changes; this version does not provide authenticated GitHub, Reddit, or LinkedIn integrations, feeds, natural-language relevance evaluation, or whole-website crawling.

**Updates** shows the changed text, original link, read status, and **Save to Library**. Existing saved pages are not duplicated. Browser notifications are opt-in and need Gather open in a browser that supports notifications. The inbox works independently of system notification support. This version has no cloud service or daily digest.

Watch settings, baselines, errors, and updates persist in `.gather/watch-state.json`. The local server protects this directory from static downloads. All local app profiles using this server share its watchlist. No pages are watched until a watch is added.

## Storage and backup

Open **Collection settings (···) → Backups → Choose folder**. A Windows folder picker selects the destination. Automatic backups are on by default once a folder is chosen, and run every 12 hours. Choose **Back up now** for an immediate copy. Settings show the last successful backup, next scheduled backup, connection freshness, and any errors. The local server must run (`python server.py`); a static file server cannot perform backups. If the computer sleeps or the server stops, one overdue backup runs after it starts again. A missing drive is retried every minute without deleting earlier copies.

The web app stores its collection in localStorage and the Chrome extension uses chrome.storage.local. These remain separate. Choose **Connect this collection** in each app/profile you use (choosing a folder also connects the current collection). Chrome requests optional localhost access for this. Connected web collections sync while their Gather tab is open; the extension syncs after saves and once a minute while Chrome runs. Automatic backups use the latest synced copy and can run with the library tab closed. Unsynced changes made while the server is off are picked up when the collection next connects. Opening an empty collection never overwrites another collection’s backup.

Each backup creates a new dated folder, with separately named, importable browser/Chrome JSON files containing links, metadata, screenshots, favorites, notes, boards, canvas positions, and workflow maps. A `backup.json` manifest written last marks a completed backup. `watch-state.json` includes watch settings, comparison baselines, and updates. Older backups are retained; they are not automatically pruned. The private `.gather/backup-state.json` stores configuration and latest synced copies so the server can back up without a browser tab open. No backup folder is selected until you choose one.

To restore a collection, choose **Import collection** from the top-right menu and select its browser/Chrome JSON file from a dated backup folder (up to 500 MB). Import merges duplicate URLs and remaps workflow connections. To restore watches and updates, stop the server, keep a spare copy of `.gather/watch-state.json`, replace it with the backup’s `watch-state.json`, and restart the server. **Export collection** remains available for a quick downloadable copy.

The interface uses system fonts and local category artwork for saves without screenshots. The local reader fetches public pages without login cookies and validates destination IPs and redirects. No page content is sent to an AI service. A bounded readable-text sample is retained locally for topic recognition, and the watcher stores a bounded text baseline for comparisons. Clearing browser data or uninstalling the extension can delete that collection, so export before doing so. Browser storage limits apply, especially to screenshots.

## Validation

- `node tests/storage.test.cjs`
- `node tests/analysis.test.cjs`
- `node tests/extension.test.cjs`
- `node tests/workflows.test.cjs`
- `node tests/search.test.cjs`
- `node tests/backups.test.cjs`
- `node tests/companion.test.cjs`
- `node tests/companion-content.test.cjs`
- `node tests/bookmarks.test.cjs`
- `node tests/bookmark-permissions.test.cjs`
- `node tests/archive.test.cjs`
- `python -m unittest discover -s tests -p "test_*.py"`

Tests cover category and website recognition, capture metadata, mid-capture navigation, duplicates, URL validation, workflow references and connectors, backup remapping, monitor baselines, relevance, deduplication, persistence, and blocked-page errors. Extension browser APIs are mocked in automated capture tests; verify the shortcut in Chrome after loading/reloading the unpacked extension.

For isolated browser UI checks, `tests/bookmark-ui-fixture.html#bookmarks` runs the real importer against in-memory sample bookmarks and mocked tab/capture APIs. It does not read or modify real Chrome bookmarks or the regular browser library.

If import reports **Only permissions specified in the manifest may be requested**, Chrome may still have an older unpacked manifest loaded even though it displays newer interface files. Open `chrome://extensions`, reload Gather, confirm the current Gather release, then close the old collection tab and reopen it from Gather’s toolbar popup. Reload the existing extension rather than removing it; saved links remain in extension storage. The importer checks Chrome’s installed manifest before requesting optional permissions and explains this recovery when a required declaration is missing.

## Reload persistence and recovery

Reload the existing unpacked extension at its existing path; do not remove it or load a different project folder as another extension. Version 0.7.3 keeps a populated safety copy in `gather-library-recovery-v1` alongside `gather-library-v1`. Reloading or recreating the app context does not clear either key. If the primary library is missing or unreadable, Gather reads the safety copy and shows a recovery message. An intentionally empty primary collection stays empty. A library revision check rejects stale writes from an older tab rather than replacing newer imports.

A collection tab left open while its extension reloads can lose its extension connection. Gather now detects a missing/changed runtime ID and offers **Reconnect library**, which refreshes that tab. The header identifies **Chrome library** or **Browser library**; their storage is separate. These protections do not replace selected-folder backups, and uninstalling the extension can delete both primary and safety copies.

## Missing Cover Flow previews

Cover Flow displays actual `screenshot` images when present. A title card labeled **NO SNAPSHOT YET** is a fallback for a link whose capture has not succeeded. Version 0.7.4 adds **Capture this page** and **Capture missing previews** directly to the extension’s Cover Flow, plus preview counts, current-page queue status, saved failure reasons, and pause/resume controls. Missing-preview capture reuses saved library entries and does not require reimporting bookmarks. The action applies to the currently filtered library.

Version 0.8.0 replaces the foreground workaround with background tab capture through Chrome’s debugger transport and `Page.captureScreenshot`. It attaches only to Gather’s own inactive capture tab, sets a consistent viewport, captures its rendered surface, and detaches in a finally block. It never focuses a window or activates the capture tab. Readback/screenshot retries remain bounded, and navigation checks protect the saved preview. Chrome’s debugging permission is required and its built-in debugging notice can appear; Gather does not suppress that notice. Toolbar and pet captures continue to use their original active-page capture path. A successful capture refreshes the cover automatically; a failed capture records its reason on the item. Reload the existing extension, reopen the collection tab, and choose **Capture missing previews** to retry missing images, including earlier failures. Restricted or blocked pages can still require manual review.

Background capture uses the official [Chrome debugger transport](https://developer.chrome.com/docs/extensions/reference/api/debugger) and the Page screenshot protocol. Reload the existing extension and accept Chrome’s new debugging permission if requested; keep the existing installation to retain links.

## Captured-text search and portable screenshot backups (0.9.0)

Library search includes saved page headings and up to 12,000 characters of captured readable text, in addition to existing metadata and bookmark folder/title fields. Website queries still filter by source. List results, Cover Flow details, and the link inspector show an escaped **From saved page** excerpt with matching terms highlighted. This searches the saved capture, not the live page or text inside images. Pages imported without a successful read need capture or **Read page again** before body keywords become searchable.

**Export library + screenshots** reads the latest stored collection and embeds all stored screenshot data URLs directly in the JSON, along with page text, notes, boards, arrangements, and workflows. Screenshot files are not needed separately. Import now restores missing images/text onto duplicate URLs instead of skipping them and preserves screenshot timestamps. The previous per-image 2 MB restore cutoff is removed; the total restore/upload limit is 500 MB. Existing screenshots and user notes are retained when merging duplicate URLs.

Chrome removes extension storage on uninstall. Version 0.9.0 therefore automatically syncs extension collections to the local Gather server, after changes and every minute while Chrome runs. Required localhost access is limited to `127.0.0.1`; no cloud service is involved. The independent copy is stored in `.gather/backup-state.json` and survives removing/reinstalling the extension, but depends on the local server having received a successful sync. Keep the server running and check **Backups → Reinstall protection** before uninstalling. A downloaded full JSON export is another independent recovery option.

On a fresh installation with an empty library and no connection identity, one available server recovery copy is restored automatically, including images, text, and workflows. Multiple copies require an explicit choice under Backups. A populated current library is never automatically replaced. The server recovery identity is reused after restoring, so an empty new installation cannot overwrite its recovery copy. Browser-preview collections remain opt-in and separate. Scheduled backups to a user-selected folder continue independently every 12 hours.
