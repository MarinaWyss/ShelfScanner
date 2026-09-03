// Shrink the chosen photo on the phone before it is sent (003 D5): a canvas
// re-encode to a 1568 px long edge JPEG with the EXIF orientation applied,
// which also drops every metadata block. If anything in that fails the
// original file is sent and the server resizes; `resized=0` tells it so.
(function () {
  var MAX_EDGE = 1568;
  var QUALITY = 0.85;
  var form = document.getElementById('scan-form');
  var input = form.querySelector('input[type=file]');
  var button = document.getElementById('scan-button');
  var prepared = null; // {file, resized}

  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return decodeWithImage(file);
      });
    }
    return decodeWithImage(file);
  }

  function decodeWithImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function shrink(file) {
    return decode(file).then(function (source) {
      var w = source.naturalWidth || source.width;
      var h = source.naturalHeight || source.height;
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      if (source.close) { source.close(); }
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('canvas produced no JPEG')); return; }
          resolve(new File([blob], 'shelf.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', QUALITY);
      });
    });
  }

  input.addEventListener('change', function () {
    prepared = null;
    var file = input.files && input.files[0];
    if (!file) { return; }
    button.disabled = true;
    button.textContent = 'Preparing photo…';
    shrink(file).then(function (small) {
      prepared = { file: small, resized: '1' };
    }).catch(function (err) {
      console.warn('Could not shrink the photo in the browser; sending the original.', err);
      prepared = { file: file, resized: '0' };
    }).then(function () {
      button.disabled = false;
      button.textContent = 'Read the shelf';
    });
  });

  form.addEventListener('htmx:configRequest', function (evt) {
    if (prepared) {
      evt.detail.parameters.photo = prepared.file;
      evt.detail.parameters.resized = prepared.resized;
    }
  });

  form.addEventListener('htmx:beforeRequest', function () {
    document.getElementById('scan').innerHTML = '<p class="uploading">Uploading photo…</p>';
  });

  // htmx leaves error responses alone by default; ours carry the message to show.
  document.body.addEventListener('htmx:beforeSwap', function (evt) {
    var status = evt.detail.xhr.status;
    if (status === 400 || status === 413 || status === 500) { evt.detail.shouldSwap = true; }
  });
})();
