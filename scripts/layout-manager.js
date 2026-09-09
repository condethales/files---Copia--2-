export class CustomLayoutManager {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.image = '';
    this.fileInput = document.getElementById('layoutFile');
    this.preview = document.getElementById('layoutPreview');
    this.previewImage = document.getElementById('layoutPreviewImage');
  }

  init() {
    this.fileInput.addEventListener('change', () => this.loadSelectedFile());
    document.getElementById('clearLayoutBtn').addEventListener('click', () => this.clear());
  }

  loadSelectedFile() {
    const file = this.fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.image = reader.result;
      this.previewImage.src = this.image;
      this.preview.hidden = false;
      this.onChange();
    };
    reader.readAsDataURL(file);
  }

  clear() {
    this.image = '';
    this.fileInput.value = '';
    this.previewImage.removeAttribute('src');
    this.preview.hidden = true;
    this.onChange();
  }
}
