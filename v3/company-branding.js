import { optimizeUploadFile, uploadSummary } from './upload-optimizer.js?v=20261113-storage-v1';
const LOGO_BUCKET = 'xrmovi-company-logos';
const MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]);

function canEdit(company) {
  return !!company && ['owner', 'manager'].includes(company.role);
}

async function decodeImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 25000000) {
      throw new Error('A imagem deve ter no máximo 25 megapixels.');
    }
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createCompanyBranding({ client, getCompany, onSave }) {
  const byId = id => document.getElementById(id);
  const image = byId('company-logo');
  const placeholder = byId('company-logo-placeholder');
  const edit = byId('company-logo-edit');
  const input = byId('company-logo-file');
  const area = byId('company-logo-area');
  const status = byId('company-logo-status');
  const name = byId('company-name');
  const nameEdit = byId('company-name-edit');
  const nameDialog = byId('company-name-dialog');
  const nameInput = byId('company-name-input');
  const nameError = byId('company-name-error');
  const nameSave = byId('company-name-save');
  const nameCancel = byId('company-name-cancel');
  let nameCompanyId = null;
  let savingName = false;
  let generation = 0;
  let imageUrl = null;
  let pickerCompanyId = null;
  const uploading = new Set();

  function feedback(message) {
    if (status) status.textContent = message;
  }

  function updateControls() {
    const company = getCompany();
    const busy = uploading.has(company?.id);
    if (edit) {
      edit.hidden = !canEdit(company);
      edit.disabled = busy;
    }
    if (area) area.setAttribute('aria-busy', String(busy));
  }

  async function logoBlob(company) {
    if (company?.logo_path) {
      const { data, error } = await client.storage.from(LOGO_BUCKET).download(company.logo_path);
      if (error) throw error;
      return data;
    }
    if (company?.logo_url) {
      const url = new URL(company.logo_url);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('URL da imagem inválida.');
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error('Imagem indisponível.');
      return response.blob();
    }
    return null;
  }

  async function render() {
    const current = getCompany();
    const request = ++generation;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    if (image) {
      image.hidden = true;
      image.removeAttribute('src');
      image.alt = current?.name ? 'Logo de ' + current.name : 'Logo da empresa';
    }
    if (placeholder) placeholder.hidden = false;
    if (name) name.textContent = current?.name || 'Empresa ativa';
    if (nameEdit) nameEdit.hidden = !canEdit(current);
    updateControls();
    feedback(uploading.has(current?.id) ? 'Salvando imagem…' : '');
    if (!current) return true;
    try {
      const blob = await logoBlob(current);
      if (request !== generation) return false;
      if (!blob) return true;
      const url = URL.createObjectURL(blob);
      imageUrl = url;
      image.src = url;
      await image.decode();
      if (request !== generation) return false;
      image.hidden = false;
      placeholder.hidden = true;
      return true;
    } catch {
      if (request === generation) {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        imageUrl = null;
        image.hidden = true;
        placeholder.hidden = false;
        feedback('Não foi possível carregar a logo. Tente atualizar os dados.');
      }
      return false;
    }
  }

  nameEdit?.addEventListener('click', () => {
    const current = getCompany();
    if (!canEdit(current) || savingName) return;
    nameCompanyId = current.id;
    nameInput.value = current.name;
    nameError.textContent = '';
    nameDialog.showModal();
    nameInput.select();
  });

  nameCancel?.addEventListener('click', () => nameDialog.close());
  nameDialog?.addEventListener('cancel', event => {
    if (savingName) event.preventDefault();
  });

  byId('company-name-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const current = getCompany();
    if (savingName || !canEdit(current) || current.id !== nameCompanyId) return;
    const proposed = nameInput.value.trim();
    if (proposed.length < 2 || proposed.length > 160) {
      nameError.textContent = 'Informe um nome com 2 a 160 caracteres.';
      return;
    }
    if (proposed === current.name) {
      nameDialog.close();
      return;
    }
    savingName = true;
    nameSave.disabled = nameCancel.disabled = true;
    nameInput.readOnly = true;
    nameError.textContent = 'Salvando…';
    try {
      const { data, error } = await client.rpc('xrmovi_company_name_save', { cid: current.id, p_name: proposed });
      if (error) throw error;
      onSave(current.id, data);
      if (getCompany()?.id === current.id) {
        name.textContent = data.name;
        if (image) image.alt = 'Logo de ' + data.name;
        feedback('Nome atualizado.');
      }
      nameDialog.close();
    } catch (error) {
      nameError.textContent = 'Não foi possível salvar o nome: ' + error.message;
    } finally {
      savingName = false;
      nameSave.disabled = nameCancel.disabled = false;
      nameInput.readOnly = false;
    }
  });

  if (edit && input) {
    edit.addEventListener('click', () => {
      const current = getCompany();
      if (!canEdit(current) || uploading.has(current.id)) return;
      pickerCompanyId = current.id;
      input.value = '';
      input.click();
    });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      const current = getCompany();
      const companyId = pickerCompanyId;
      input.value = '';
      pickerCompanyId = null;
      if (!file) return;
      if (!canEdit(current) || current.id !== companyId || uploading.has(companyId)) return;
      uploading.add(companyId);
      updateControls();
      feedback('Validando imagem…');
      let saved = false;
      try {
        if (!IMAGE_TYPES.has(file.type)) throw new Error('Selecione uma imagem PNG, JPG ou WebP.');
        if (!file.size || file.size > MAX_BYTES) throw new Error('A imagem deve ter até 2 MB.');
        await decodeImage(file);
        const { file: prepared, stats } = await optimizeUploadFile(file, {
          purpose: 'logo', maxBytes: MAX_BYTES,
          onPhase: phase => { if (getCompany()?.id === companyId && phase === 'optimizing') feedback('Otimizando logo…'); }
        });
        // A different company may be selected while the file is being decoded.
        if (getCompany()?.id !== companyId) return;
        feedback('Salvando imagem… ' + uploadSummary(stats));
        const path = companyId + '/' + crypto.randomUUID() + '.' + IMAGE_TYPES.get(prepared.type);
        const { error: uploadError } = await client.storage.from(LOGO_BUCKET).upload(path, prepared, {
          contentType: prepared.type, cacheControl: '3600', upsert: false
        });
        if (uploadError) throw uploadError;
        const { data, error } = await client.rpc('xrmovi_company_logo_save', { cid: companyId, p_path: path });
        if (error) throw error;
        onSave(companyId, data);
        saved = true;
        if (getCompany()?.id === companyId) {
          const displayed = await render();
          if (displayed && getCompany()?.id === companyId) feedback('Logo / Foto atualizada. ' + uploadSummary(stats));
        }
      } catch (error) {
        if (getCompany()?.id === companyId) feedback('Não foi possível salvar a logo: ' + (error.message || 'Tente novamente.'));
      } finally {
        // Existing images are never removed, including when the database save fails.
        uploading.delete(companyId);
        updateControls();
        if (!saved && getCompany()?.id === companyId && !status?.textContent) feedback('Upload cancelado.');
      }
    });
  }

  // Capture the identity before awaiting so a company switch never mixes report branding.
  async function forPdf() {
    const current = getCompany();
    if (!current) return null;
    const identity = { companyId: current.id, name: current.name, logo_url: current.logo_url || null };
    const blob = await logoBlob({ ...current });
    if (!blob) return { ...identity, logoDataUrl: null };
    const decoded = await decodeImage(blob);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(decoded.naturalWidth, decoded.naturalHeight));
    canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
    canvas.getContext('2d').drawImage(decoded, 0, 0, canvas.width, canvas.height);
    return { ...identity, logoDataUrl: canvas.toDataURL('image/png') };
  }

  return { render, forPdf };
}
