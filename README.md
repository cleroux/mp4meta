mp4meta
=======

Create or update metadata in an MP4 file.  
Supports the title, album, and artist fields.

## Usage:

```js
// Create an Mp4Meta object, passing in an Array of bytes representing the MP4 file.
// setTitle(), setArtist(), and setAlbum() are optional and chainable.
var myMp4 = new Mp4Meta(songData)
  .setTitle(title)
  .setArtist(artist)
  .setAlbum(album);

// apply() updates the MP4's metadata and returns the buffer array of binary data
var buffer = mp4.apply();

// toBase64() is also available to convert the binary MP4 data to base64
var base64 = mp4.toBase64();
```
