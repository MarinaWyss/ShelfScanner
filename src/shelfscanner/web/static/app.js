// The page script (003 D5, 012, 014): the drawer, the preferences step's author chips, and the
// upload step: the photo is shrunk on the phone before it is sent (a canvas re-encode to a 1568 px
// long edge JPEG with the EXIF orientation applied, which also drops every metadata block; if that
// fails the original is sent and `resized=0` tells the server so).
(function () {
  var MAX_EDGE = 1568;
  var QUALITY = 0.85;

  // --- the theme toggle (016; ThemeToggle.tsx): flips data-theme and remembers it on the device ---
  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  // --- the drawer (Navbar.tsx) ---
  var toggle = document.getElementById('menu-toggle');
  var overlay = document.getElementById('overlay');
  function setDrawer(open) {
    document.body.classList.toggle('drawer-open', open);
    if (toggle) { toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  }
  if (toggle) { toggle.addEventListener('click', function () { setDrawer(!document.body.classList.contains('drawer-open')); }); }
  if (overlay) { overlay.addEventListener('click', function () { setDrawer(false); }); }
  document.addEventListener('keydown', function (evt) { if (evt.key === 'Escape') { setDrawer(false); } });

  // --- step 1: favorite authors as chips (PreferencesStep.tsx). The hidden `authors` field carries the
  // list; whatever is still typed in the box goes with the form as `authors_extra`. ---
  var authorInput = document.getElementById('author-input');
  if (authorInput) {
    var chips = document.getElementById('author-chips');
    var hidden = document.getElementById('authors-hidden');
    var addButton = document.getElementById('author-add');
    var authors = hidden.value ? hidden.value.split(',').map(function (a) { return a.trim(); }).filter(Boolean) : [];

    function render() {
      hidden.value = authors.join(', ');
      chips.innerHTML = '';
      authors.forEach(function (name) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.appendChild(document.createTextNode(name));
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + name);
        remove.innerHTML = '<svg class="i s" viewBox="0 0 24 24" style="width:.75rem;height:.75rem"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        remove.addEventListener('click', function () {
          authors = authors.filter(function (a) { return a !== name; });
          render();
        });
        chip.appendChild(remove);
        chips.appendChild(chip);
      });
    }
    function addAuthor() {
      var name = authorInput.value.trim();
      if (name && !authors.some(function (a) { return a.toLowerCase() === name.toLowerCase(); })) {
        authors.push(name);
        render();
      }
      authorInput.value = '';
    }
    addButton.addEventListener('click', addAuthor);
    authorInput.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') { evt.preventDefault(); addAuthor(); }
    });
    render();
  }

  // --- step 2: the photo (UploadStep.tsx) ---
  var form = document.getElementById('scan-form');
  if (!form) { return; }
  var input = form.querySelector('input[type=file]');
  var button = document.getElementById('scan-button');
  var hint = document.getElementById('scan-hint');
  var dropzone = document.getElementById('dropzone');
  var idle = document.getElementById('dz-idle');
  var previewBox = document.getElementById('dz-preview');
  var preview = document.getElementById('preview');
  var preparing = document.getElementById('dz-preparing');
  var chooser = document.getElementById('choose-image');
  var text = document.getElementById('dz-text');
  var prepared = null; // {file, resized}

  if (text && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    text.textContent = 'Take a photo or choose from your gallery';
  }
  if (chooser) { chooser.addEventListener('click', function () { input.click(); }); }
  if (dropzone) {
    dropzone.addEventListener('dragover', function (evt) { evt.preventDefault(); dropzone.classList.add('over'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('over'); });
    dropzone.addEventListener('drop', function (evt) {
      evt.preventDefault();
      dropzone.classList.remove('over');
      if (evt.dataTransfer && evt.dataTransfer.files && evt.dataTransfer.files.length) {
        input.files = evt.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

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

  function showPreview(file) {
    if (!previewBox) { return; }
    idle.hidden = true;
    previewBox.hidden = false;
    preview.src = URL.createObjectURL(file);
  }

  input.addEventListener('change', function () {
    prepared = null;
    var file = input.files && input.files[0];
    if (!file) { return; }
    hint.hidden = true;
    button.disabled = true;
    button.textContent = 'Preparing photo…';
    if (preparing) { preparing.hidden = false; }
    shrink(file).then(function (small) {
      prepared = { file: small, resized: '1' };
      showPreview(small);
    }).catch(function (err) {
      console.warn('Could not shrink the photo in the browser; sending the original.', err);
      prepared = { file: file, resized: '0' };
      showPreview(file);
    }).then(function () {
      button.disabled = false;
      button.textContent = 'Get Recommendations';
      if (preparing) { preparing.hidden = true; }
    });
  });

  // 012: iOS Safari enforces `required` on a file input without showing anything, so the input has no
  // `required` and this runs first (capture phase, before htmx's own submit listener): with no photo,
  // say so and open the picker instead of sending an empty request.
  form.addEventListener('submit', function (evt) {
    if (input.files && input.files.length) { hint.hidden = true; return; }
    evt.preventDefault();
    evt.stopImmediatePropagation();
    hint.hidden = false;
    input.click();
  }, true);

  form.addEventListener('htmx:configRequest', function (evt) {
    if (prepared) {
      evt.detail.parameters.photo = prepared.file;
      evt.detail.parameters.resized = prepared.resized;
    }
  });

  form.addEventListener('htmx:beforeRequest', function () {
    var stepper = document.getElementById('stepper');
    if (stepper) { stepper.dataset.step = '3'; }
    var step = document.getElementById('upload-step');
    var back = document.getElementById('upload-back');
    if (step) { step.hidden = true; }  // the result takes the step's place; "Start Over" brings the form back
    if (back) { back.hidden = true; }
    document.getElementById('scan').innerHTML =
      '<div class="dropzone"><div class="working"><div class="spin"></div><p class="uploading t2">Uploading image...</p></div></div>';
  });

  // htmx leaves error responses alone by default; ours carry the message to show
  // (400 bad upload, 413 too big, 429 scan limit, 500 store failure, 503 daily cap).
  document.body.addEventListener('htmx:beforeSwap', function (evt) {
    var status = evt.detail.xhr.status;
    if (status === 400 || status === 413 || status === 429 || status === 500 || status === 503) {
      evt.detail.shouldSwap = true;
      var step = document.getElementById('upload-step');
      var stepper = document.getElementById('stepper');
      var back = document.getElementById('upload-back');
      if (step) { step.hidden = false; }
      if (back) { back.hidden = false; }
      if (stepper) { stepper.dataset.step = '2'; }
    }
  });

  // "Try again" after a failed stage (008): submit the form again, which starts a new scan of the
  // photo still in the picker; with no photo chosen the submit listener above opens the picker.
  document.body.addEventListener('click', function (evt) {
    if (evt.target && evt.target.id === 'scan-retry') {
      if (form.requestSubmit) { form.requestSubmit(); } else { htmx.trigger(form, 'submit'); }
    }
  });
})();
