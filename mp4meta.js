/*
Create or update metadata in an MP4 file.
Supports title, album, and artist.

Usage:

	// Create an Mp4 object, passing in an Array of bytes representing the MP4 file.
	// setTitle(), setArtist(), and setAlbum() are optional and chainable.
  var myMp4 = new Mp4Meta(songData)
    .setTitle(title)
    .setArtist(artist)
    .setAlbum(album);

	// apply() updates the MP4's metadata and returns the buffer array of binary data
	var buffer = mp4.apply();

	// toBase64() is also available to convert the binary MP4 data to base64
  var base64 = mp4.toBase64();
*/

function Mp4Meta(data) {
	var _title = '';
	var _artist = '';
	var _album = '';
	var _data = null;
	
	if (data === undefined || data == null) {
		throw new TypeError("MP4 data must be provided to the constructor");
	}
	_data = data;
	
	this.setTitle = function(title) {
		_title = title;
		return this;
	};
	
	this.setArtist = function(artist) {
		_artist = artist;
		return this;
	};
	
	this.setAlbum = function(album) {
		_album = album;
		return this;
	};
	
	this.apply = function() {
		
		// Create a new metadata block
		var metaData = new Uint8Array(createMetaData());

		// Save the file's root header
		var rootHdr = _data.slice(0, 36);
		
		// Create a new MOOV header with updated size for metadata
		var moovHdr = [];
		var moovSize = readUint32(_data, 36) + metaData.length;
		writeMetaUint32(moovHdr, moovSize);
		writeMetaText(moovHdr, 'moov');
		
		var remData = _data.slice(44);

		// Create a new MP4 using the updated sections
		var newData = new Uint8Array(_data.byteLength + metaData.byteLength);
		newData.set(rootHdr, 0);
		newData.set(moovHdr, 36);
		newData.set(metaData, 44);
		newData.set(remData, 44 + metaData.byteLength);
		
		var stcoOffset = findBox(['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco'], newData, 36);
		if (stcoOffset < 0) {
			// STCO not found, metadata not added, return original data
			return data;
		}
		
		// Create a new STCO section by adding the size of metadata to the existing offsets
		var stcoSize = readUint32(newData, stcoOffset);
		let newStcoData = [];
		for (let i=16; i<stcoSize; i+=4) {
			let offsetVal = readUint32(newData, stcoOffset + i) + metaData.byteLength;
			writeMetaUint32(newStcoData, offsetVal);
		}
		
		// Overwrite the old STCO section
		newData.set(new Uint8Array(newStcoData), stcoOffset + 16);
		
		_data = newData;
		return _data;
	};
	
	/**
	 * Navigate the file's tree structure to locate the desired section.
	 * @param {array}     boxtree Array of string box codes representing the path
	 *                    to follow in the file's tree structure.
	                      eg. ['moov', 'udta']
	 * @param {ByteArray} buf Array of file data.
	 * @param {integer}   offset File offset to start reading from.
	 * @return {integer}  File offset of the desired section or -1 if the section
	 *                    is not found.
	 */
	function findBox(boxTree, buf, offset) {
		
		while (offset >= 0 && offset < buf.byteLength) {
			let size = readUint32(buf, offset);
			let box = readText(buf, offset+4, 4);
			
			if (box == boxTree[boxTree.length-1]) {
				return offset;
			} else if (boxTree[0] == box) {
				offset = findBox(boxTree.slice(1), buf, offset + 8);
			} else {
				offset += size;
			}
		}

		return -1;
	}

	/**
	 * Create the metadata block for an MP4 file.
	 * For MP4 structure and format, see http://xhelmboyx.tripod.com/formats/mp4-layout.txt
	 * @return {array} Array of bytes representing the metadata section of the MP4
	 */
	function createMetaData() {

		var titleDataSize = _title.length + 16; // ilstNamSize = titleDataSize + 8
		var albumDataSize = _album.length + 16; // ilstAlbSize = albumDataSize + 8
		var artistDataSize = _artist.length + 16; // ilstArtSize = artistDataSize + 8
		var ilstSize = (titleDataSize+8) + (albumDataSize+8) + (artistDataSize+8) + 8;
		var hdlrSize = 33;
		
		var metaSize = hdlrSize + ilstSize + 12;
		//var metaSize = 1077; // TODO: temporarily using free section to match VLC
		var udtaSize = metaSize + 8;
		
		// "moov"
		//-- START OF METADATA --
		var meta = [];
		writeMetaUint32(meta, udtaSize); // 4 byte unsigned size
		writeMetaText(meta, 'udta'); // "udta"
		writeMetaUint32(meta, metaSize); // 4 byte unsigned size
		writeMetaText(meta, 'meta'); // "meta"
		writeMetaUint32(meta, 0); // 4 byte version/flags = 0
		writeMetaUint32(meta, 33); // 4 byte unsigned size
		writeMetaText(meta, 'hdlr'); // "hdlr"
		writeMetaUint32(meta, 0); // 4 byte version/flags = 0
		writeMetaUint32(meta, 0); // 4 byte quicktime type eg. "mhlr" OK to put zeroes
		writeMetaText(meta, 'mdir'); // 4 bytes subtype/meta data type "mdir"
		writeMetaText(meta, 'appl'); // 4 bytes QUICKTIME manufacturer reserved "appl"
		writeMetaUint32(meta, 0); // 4 bytes QUICKTIME component reserved flags = 0
		writeMetaUint32(meta, 0); // 4 bytes QUICKTIME component reserved flags mask = 0
		// Component type name ASCII string, can be zero length
		meta.push(0); // 1 byte string end = byte padding set to zero
		writeMetaUint32(meta, ilstSize);// 4 byte unsigned size
		writeMetaText(meta, 'ilst'); // "ilst"
		// -- REPEAT BELOW
		// 4 byte unsigned size (0x29 = 8 bytes + data size below)
		// "0xA9 + ART" (Artist) or "0xA9 + alb" (Album) or "0xA9 + nam" (Title/Name)
		// 4 byte unsigned size (include self in size)
		// "data"
		// 4 byte version/flags. version = 0.  Flags = Contains text = 0x1  So use "0x00 00 00 01"
		// 4 byte reserved = 0
		// Variable length string of size specified 4 lines up
		
		// eg. "Don't Let Me Down" = 17 + 4 + 4 + 4 + 4 = 33 = 0x21
		// eg. "The Chainsmokers (Feat. Daya) (W&W Remix)" = 41 + 16 = 57 = 0x39
		
		writeMetaUint32(meta, artistDataSize + 8);
		meta.push(0xA9);
		writeMetaText(meta, 'ART');
		writeMetaUint32(meta, artistDataSize);
		writeMetaText(meta, 'data');
		writeMetaUint32(meta, 1); // Flags = 0x1 = Text
		writeMetaUint32(meta, 0); // reserved = 0
		writeMetaText(meta, _artist);
		
		writeMetaUint32(meta, albumDataSize + 8);
		meta.push(0xA9);
		writeMetaText(meta, 'alb');
		writeMetaUint32(meta, albumDataSize);
		writeMetaText(meta, 'data');
		writeMetaUint32(meta, 1);
		writeMetaUint32(meta, 0);
		writeMetaText(meta, _album);
		
		writeMetaUint32(meta, titleDataSize + 8);
		meta.push(0xA9);
		writeMetaText(meta, 'nam');
		writeMetaUint32(meta, titleDataSize);
		writeMetaText(meta, 'data');
		writeMetaUint32(meta, 1);
		writeMetaUint32(meta, 0);
		writeMetaText(meta, _title);
		
		// Add a "free" section like VLC
		/*var freeSize = 1032 - ilstSize;
		writeMetaUint32(meta, freeSize);
		writeMetaText(meta, 'free');
		for (var i=0; i<freeSize-8; i++) {
			meta.push(0x1);
		}*/
		
		return meta;
	}
	
	/**
	 * Return the Mp4 encoded using base64.
	 * @return {string} Mp4 encoded as Base64
	 */
	this.toBase64 = function() {
		var binary = '';
		var bytes = new Uint8Array(_data);
		var len = bytes.byteLength;
		for (var i=0; i<len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}
	
	/**
	 * Write a 32 bit integer to an array of bytes.
	 * Modifies the given array directly.
	 * @param {array} buf Array of bytes
	 * @param {integer} val Integer value to write to the array
	 */
	function writeMetaUint32(buf, val) {
		if (val > 0xFFFFFFFF || val < 0) {
			throw new RangeError('writeMetaUint32 Error:' + val + ' is out of bounds')
		}
		buf.push((val >>> 24) & 0xFF)
		buf.push((val >>> 16) & 0xFF)
		buf.push((val >>> 8) & 0xFF)
		buf.push((val >>> 0) & 0xFF)
	}

	/**
	 * Write a string to an array of bytes.
	 * Modifies the given array directly.
	 * @param {array} buf Array of bytes
	 * @param {string} val String value to write to the array
	 */
	function writeMetaText(buf, val) {
		for (var i=0; i<val.length; i++) {
			buf.push(val.charCodeAt(i));
		}
	}

	/**
	 * Read a 32 bit integer from an array of bytes.
	 * @param {array} buf Array of bytes
	 * @param {integer} offset Buffer offset to start reading the integer.
	 * @return {integer} Integer value
	 */
	function readUint32(buf, offset) {
		if ((offset % 1) !== 0 || offset < 0) {
			throw new RangeError('readUint32 Error: ' + offset + ' is not uint')
		}
		
		return ((buf[offset] & 0xFF) << 24) |
			((buf[++offset] & 0xFF) << 16) |
			((buf[++offset] & 0xFF) << 8) |
			((buf[++offset] & 0xFF) << 0)
	}

	/**
	 * Read a string from an array of bytes.
	 * @param {array} buf Array of bytes
	 * @param {integer} offset Buffer offset to start reading the string
	 * @param {integer} size Length of the string to read
	 * @return {string} String value
	 */
	function readText(buf, offset, size) {
		if ((offset % 1) !== 0 || offset < 0) {
			throw new RangeError('readText Error: ' + offset + ' is not uint')
		}
		let text = [];
		for (let i=0; i<size; i++) {
			text.push(String.fromCharCode(buf[offset+i]));
		}
		return text.join('');
	}
	
};
