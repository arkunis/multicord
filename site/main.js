// Liens de téléchargement vers les fichiers de la dernière release GitHub (version et taille affichées).
// Sans réponse de l'API, les boutons gardent le lien vers la page de la dernière release.
(async () => {
  try {
    const response = await fetch('https://api.github.com/repos/arkunis/multicord/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return;
    const release = await response.json();
    const find = kind => release.assets.find(a => a.name.endsWith('.exe') && a.name.includes(kind === 'setup' ? '-Setup-' : '-Portable-'));
    const size = bytes => `${(bytes / 1048576).toFixed(0)} Mo`;
    const version = release.tag_name.replace(/^v/, '');
    for (const kind of ['setup', 'portable']) {
      const asset = find(kind);
      if (!asset) continue;
      document.querySelectorAll(`[data-download="${kind}"]`).forEach(link => { link.href = asset.browser_download_url; });
      document.querySelectorAll(`[data-size="${kind}"]`).forEach(label => { label.textContent = `${asset.name} · ${size(asset.size)}`; });
    }
    const date = new Date(release.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    document.querySelectorAll('[data-release-version]').forEach(el => { el.textContent = `Version ${version} · ${date}`; });
    document.querySelectorAll('[data-release-meta]').forEach(el => { el.textContent = `Version ${version} · Windows 10 et 11 · 64 bits`; });
  } catch { /* liens de secours déjà en place */ }
})();
