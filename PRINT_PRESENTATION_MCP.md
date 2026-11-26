# Revisian printing, presentation, and MCP

## Print an entire pack

Open a pack or one of its member notes and press **Ctrl+Alt+Shift+P**, or use **Print** in the workspace toolbar. Print mode gathers the pack members in pack order and builds a printer-friendly document. It includes note sections, available imported source text and source-page URLs, web links, and Revisian note destinations. Images are included with their source URLs; available board canvases are captured as printable images. Each pack member can have a labelled teacher-stamp/feedback area.

The print panel lets you choose paper size and orientation, margins, a binding edge, one or two columns, text size, ink saver, image and URL display, page numbers, a cover page, section breaks, and key-term lists. Use **Print / Save PDF** to open the browser’s print dialog.

**Print-media limitation:** paper cannot reproduce moving video or audio. Revisian prints an available poster/thumbnail, or a labelled media placeholder, together with the media URL. Source text is limited to material already imported or extracted into Revisian; print mode does not fetch arbitrary external websites to print their live contents.

## Presentation mode

Use **Present** in the workspace toolbar or choose **Presentation mode** from Revision styles. For a pack, the deck combines the member notes’ sections, includes a references slide for external and Revisian destinations, and provides a board overview with available media when a member has no prose note. Images, direct video/audio sources, and supported YouTube/Vimeo embeds are represented in slides. External embeds load when their slide is activated.

## Read-only MCP export

The Revisian MCP server operates on the selected local source export; it does not connect to or modify a live vault. Its read-only tools are:

- `list_notes` — list exported items in pack order.
- `read_note` — read a note, board, or pack cover in character-offset chunks.
- `search_notes` — search titles, subjects, and content with ranked exact/partial matches and typo tolerance.
- `list_links` — extract unique HTTP(S) links from one exported item or the whole selected export. It reports destinations without fetching them.

The MCP process accepts a source-export file path:

```sh
node downloads/revisian-mcp.cjs /absolute/path/to/revisian-mcp-source.json
```

The export is a bounded snapshot, not a general browser or file-access tool. MCP search, link listing, and note reads are limited to the items in that export.
