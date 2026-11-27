# Storage

Owns persistence adapters and schema migrations. Keep persistence details behind interfaces.

## Branding compatibility

Keyboard settings use `mytheorylab:keyboard-preferences`. On the same origin, a valid record at the previous key is read when the new key is missing or unreadable. The next settings change writes the whole validated record to the new key. The old keys remain available for older app builds.

The content adapter retains the original physical IndexedDB database name. This keeps existing records, file data and favourites available in place. Current browser data is visible only on its original origin. Export and import a library pack to move content between site addresses.
