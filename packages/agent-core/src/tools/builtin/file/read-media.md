Read media content from a file.

- A `<system>` tag precedes the file content; it summarizes mime type, byte size and, for images, original pixel dimensions. When outputting coordinates, give relative coordinates first and compute absolute coordinates from the original image size. After generating or editing media via commands or scripts, read the result back before continuing.
- Use this tool in parallel when possible — always read multiple files in one response.
- This tool can only read image or video files. To read text files, use the Read tool. To list directories, use `ls` via Bash for a known directory, or Glob for pattern search.
- The maximum size is {{ MAX_MEDIA_MEGABYTES }}MB.
- The media content is returned in a form you can directly view and understand.
