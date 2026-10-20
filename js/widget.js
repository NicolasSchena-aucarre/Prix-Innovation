/*
 * Widget « Projets » : liste de cartes avec recherche, filtre par balise, pagination
 * et fenêtre de détail (galerie photo, vidéos hébergées à l'extérieur).
 * S'appuie sur js/socle.js pour la lecture de la table et l'accès aux pièces jointes.
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = Socle.echapper;

  // Réglages : tout se règle dans js/config.js. Un réglage invalide est signalé ici, avec son explication.
  var CFG;
  try { CFG = Socle.config(); }
  catch (e) {
    $('#liste').innerHTML = '<div class="fr-alert fr-alert--info"><h3 class="fr-alert__title">Widget mal configuré</h3><p>' + esc(e.message) + '</p></div>';
    return;
  }
  // Le lecteur d'une vidéo s'affiche d'emblée seulement si son hôte est celui du widget ou figure dans config.js.
  var HOTES_SANS_CLIC = [location.hostname].concat(CFG.hotesSansClic);
  var acc = new Socle.AccesPieces();
  var etat = { q: '', balise: '', page: 1 };
  var projets = [], tri = [], res = [], minuteur, avertiPhotos = false;

  var el = {
    q: $('#q'), balise: $('#balise'), groupeBalise: $('#groupe-balise'), compteur: $('#compteur'), reinit: $('#reinit'),
    avis: $('#avis'), liste: $('#liste'), pagination: $('#pagination'), dlg: $('#detail'),
    corps: $('#m-corps'), prec: $('#m-prec'), suiv: $('#m-suiv'), pos: $('#m-pos')
  };

  // ---------- icônes (SVG en ligne, aucune requête) ----------
  function svg(d) { return '<svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>'; }
  var ICONE = {
    gauche: svg('m10.83 12 4.95 4.95-1.41 1.41L8 12l6.37-6.36 1.41 1.41z'),
    droite: svg('M13.17 12 8.22 7.05l1.41-1.41L16 12l-6.37 6.36-1.41-1.41z'),
    lecture: svg('M8 5v14l11-7z')
  };

  // Pictogramme officiel du DSFR (fichiers dans dsfr/artwork) : « video » pour un projet qui n'a que de la vidéo,
  // « pictures » pour un projet sans aucun média.
  function pictogramme(nom) {
    var src = 'dsfr/artwork/pictograms/leisure/' + nom + '.svg';
    return '<svg class="fr-artwork app-pictogramme" aria-hidden="true" viewBox="0 0 80 80" width="80" height="80">' +
      ['decorative', 'minor', 'major'].map(function (c) { return '<use class="fr-artwork-' + c + '" href="' + src + '#artwork-' + c + '"></use>'; }).join('') + '</svg>';
  }

  // ---------- outils ----------
  function nombre(n) { return n.toLocaleString(CFG.langue); }
  function pluriel(n, mot) { return nombre(n) + ' ' + mot + (n > 1 ? 's' : ''); }
  function hote(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
  function nomLecteur(v) {
    if (v.type === 'youtube') return 'YouTube (mode sans cookies)';
    if (v.type === 'vimeo') return 'Vimeo';
    return hote(v.url);
  }
  // Le lecteur contacte-t-il un hôte de confiance ? (c'est l'adresse du lecteur qui compte, pas celle de la page de la vidéo)
  function sansClic(v) { return !!v.embed && HOTES_SANS_CLIC.indexOf(hote(v.embed)) !== -1; }
  // Après un clic sur « Lancer la vidéo », la lecture démarre aussitôt : un seul clic suffit au visiteur.
  function urlLecteur(v, lancer) { return lancer ? v.embed + (v.embed.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1' : v.embed; }
  function lecteurHTML(p, it, lancer) {
    var v = it.v, titre = 'Vidéo ' + it.n + ' du projet « ' + p.titre + ' »';
    if (v.type === 'direct') return '<video controls playsinline preload="metadata"' + (lancer ? ' autoplay' : '') + ' src="' + esc(v.embed) + '" title="' + esc(titre) + '"></video>';
    return '<iframe src="' + esc(urlLecteur(v, lancer)) + '" title="' + esc(titre) + '" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  }
  function nomSite(v) { return v.type === 'youtube' ? 'YouTube' : v.type === 'vimeo' ? 'Vimeo' : hote(v.url); }
  function videosValides(p) { return p.videos.filter(function (v) { return v.type !== 'invalide'; }); }
  function libelleMedias(p) {
    var a = [], v = videosValides(p).length;
    if (p.photos.length) a.push(pluriel(p.photos.length, 'photo'));
    if (v) a.push(pluriel(v, 'vidéo'));
    return a.join(' · ');
  }
  // Diapositives de la galerie : photos d'abord, puis vidéos.
  function medias(p) {
    var m = p.photos.map(function (id) { return { k: 'photo', id: id }; });
    videosValides(p).forEach(function (v, i) { m.push({ k: 'video', v: v, n: i + 1 }); });
    return m;
  }

  // ---------- chargement des images par pièce jointe ----------
  // Le jeton d'accès expire (environ 15 minutes) : on le demande au moment où l'image devient visible.
  var observateur = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entrees) {
        entrees.forEach(function (e) { if (e.isIntersecting) { observateur.unobserve(e.target); charger(e.target); } });
      }, { rootMargin: CFG.margeImagesPx + 'px' })
    : null;

  function lierImages(racine, immediat) {
    racine.querySelectorAll('img[data-piece]').forEach(function (img) {
      if (observateur && !immediat) observateur.observe(img); else charger(img);
    });
  }
  function charger(img) {
    acc.obtenir().then(function () { img.src = acc.url(img.getAttribute('data-piece')); }, function () { echec(img); });
  }
  function echec(img) {
    avertirPhotosIndisponibles();
    var scene = img.closest('.app-scene');
    if (scene) { scene.innerHTML = '<p class="app-echec">Cette photo n’a pas pu être chargée pour le moment.</p>'; return; }
    var neutre = document.createElement('div');
    neutre.className = 'app-neutre'; neutre.setAttribute('aria-hidden', 'true');
    img.parentNode.replaceChild(neutre, img);
  }
  // Une image peut échouer parce que le jeton a expiré : un seul nouvel essai avec un jeton neuf.
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (img && img.tagName === 'VIDEO' && img.closest('.app-scene')) { echecVideo(img); return; }
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-piece')) return;
    if (img.getAttribute('data-essai')) { echec(img); return; }
    img.setAttribute('data-essai', '1');
    acc.expire = 0;
    acc.obtenir().then(function () { img.src = acc.url(img.getAttribute('data-piece')); }, function () { echec(img); });
  }, true);

  function avertirPhotosIndisponibles() {
    if (avertiPhotos) return;
    avertiPhotos = true;
    el.avis.insertAdjacentHTML('beforeend', '<div class="fr-alert fr-alert--info fr-alert--sm" role="status"><p>Les photos ne peuvent pas être affichées pour le moment.</p></div>');
  }

  // ---------- cartes ----------
  function carte(p) {
    var cid = p.photos[0], badge = libelleMedias(p);
    var image;
    if (cid) image = '<img class="fr-responsive-img app-img" alt="" data-piece="' + cid + '">';
    else image = '<div class="app-neutre" aria-hidden="true">' + pictogramme(videosValides(p).length ? 'video' : 'pictures') + '</div>';
    var tags = p.balises.length
      ? '<div class="fr-card__start"><ul class="fr-tags-group">' + p.balises.map(function (b) { return '<li><p class="fr-tag fr-tag--sm">' + esc(b) + '</p></li>'; }).join('') + '</ul></div>' : '';
    return '<li><div class="fr-card fr-enlarge-button"><div class="fr-card__body"><div class="fr-card__content">' +
      '<h3 class="fr-card__title"><button type="button" data-ouvrir="' + p.id + '" aria-haspopup="dialog">' + esc(p.titre || 'Projet sans titre') + '</button></h3>' +
      (p.description ? '<p class="fr-card__desc">' + esc(p.description) + '</p>' : '') + tags +
      (p.date ? '<div class="fr-card__end"><p class="fr-card__detail">Ajouté le ' + esc(Socle.formaterDate(p.date)) + '</p></div>' : '') +
      '</div></div><div class="fr-card__header"><div class="fr-card__img">' + image + '</div>' +
      (badge ? '<ul class="fr-badges-group"><li><p class="fr-badge fr-badge--sm fr-badge--no-icon">' + esc(badge) + '</p></li></ul>' : '') +
      '</div></div></li>';
  }

  // ---------- filtrage et affichage ----------
  function majBalises() {
    var liste = Socle.listeBalises(projets), courante = etat.balise;
    el.balise.innerHTML = '<option value="">Toutes les balises</option>' + liste.map(function (b) { return '<option>' + esc(b.nom) + '</option>'; }).join('');
    if (!liste.some(function (b) { return b.nom === courante; })) etat.balise = '';
    el.balise.value = etat.balise;
    el.groupeBalise.hidden = !liste.length;
  }

  function executer() {
    res = Socle.filtrer(tri, { texte: etat.q, balise: etat.balise }, true);
    var pages = Math.max(1, Math.ceil(res.length / CFG.parPage));
    if (etat.page > pages) etat.page = pages;
    var tranche = res.slice((etat.page - 1) * CFG.parPage, etat.page * CFG.parPage);
    var actif = etat.q.trim() || etat.balise;

    el.compteur.innerHTML = '<strong>' + pluriel(res.length, 'projet') + '</strong> sur ' + nombre(projets.length) + ' · du plus récent au plus ancien';
    el.reinit.hidden = !actif;

    if (!projets.length) {
      el.compteur.textContent = '';
      el.liste.innerHTML = '<div class="fr-alert fr-alert--info"><h3 class="fr-alert__title">Aucun projet pour le moment</h3><p>Les projets publiés apparaîtront ici.</p></div>';
    } else if (!res.length) {
      el.liste.innerHTML = '<div class="fr-alert fr-alert--info"><h3 class="fr-alert__title">Aucun projet ne correspond à votre recherche.</h3><p>Vérifiez l’orthographe, essayez d’autres mots ou choisissez « Toutes les balises ».</p>' +
        '<button type="button" class="fr-btn fr-btn--secondary fr-btn--sm" data-reinit2>Réinitialiser les filtres</button></div>';
    } else {
      el.liste.innerHTML = '<ul class="fr-raw-list app-cartes">' + tranche.map(carte).join('') + '</ul>';
      lierImages(el.liste, false);
    }
    dessinerPagination(pages);
  }

  function dessinerPagination(pages) {
    if (pages < 2) { el.pagination.hidden = true; el.pagination.innerHTML = ''; return; }
    var c = etat.page, n = [], i, h = '';
    for (i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - c) <= 1) n.push(i);
    function lien(classe, page, texte, titre, actif) {
      return '<li><a class="fr-pagination__link ' + classe + '"' + (actif ? ' href="#liste" data-page="' + page + '"' : ' aria-disabled="true" role="link"') + ' title="' + titre + '">' + texte + '</a></li>';
    }
    h += lien('fr-pagination__link--first', 1, 'Première page', 'Première page', c > 1);
    h += lien('fr-pagination__link--prev fr-pagination__link--lg-label', c - 1, 'Page précédente', 'Page précédente', c > 1);
    n.forEach(function (num, k) {
      if (k > 0 && num - n[k - 1] > 1) h += '<li><span class="fr-pagination__link fr-hidden fr-unhidden-lg">…</span></li>';
      var proche = Math.abs(num - c) <= 1, cache = proche ? '' : ' fr-hidden fr-unhidden-lg';
      h += num === c
        ? '<li><a class="fr-pagination__link" aria-current="page" title="Page ' + num + '">' + num + '</a></li>'
        : '<li><a class="fr-pagination__link' + cache + '" href="#liste" data-page="' + num + '" title="Page ' + num + '">' + num + '</a></li>';
    });
    h += lien('fr-pagination__link--next fr-pagination__link--lg-label', c + 1, 'Page suivante', 'Page suivante', c < pages);
    h += lien('fr-pagination__link--last', pages, 'Dernière page', 'Dernière page', c < pages);
    el.pagination.innerHTML = '<ul class="fr-pagination__list">' + h + '</ul>';
    el.pagination.hidden = false;
  }

  function reinitialiser() {
    etat = { q: '', balise: '', page: 1 };
    el.q.value = ''; el.balise.value = '';
    executer(); el.q.focus();
  }

  // ---------- fenêtre de détail ----------
  var cur = -1, diapo = 0, ouvreur = null;

  function ouvrir(id, depuis) {
    ouvreur = depuis || ouvreur;
    cur = res.findIndex(function (p) { return p.id === id; });
    if (cur < 0) return;
    diapo = 0; dessiner();
    if (!el.dlg.open) el.dlg.showModal();
    el.dlg.scrollTop = 0;
    $('#m-fermer').focus();
  }

  function scene(p, m) {
    if (!m.length) return '<div class="app-scene app-scene--vide" aria-hidden="true">' + pictogramme('pictures') + '</div>';
    var it = m[diapo], contenu;
    if (it.k === 'photo') {
      contenu = '<img data-piece="' + it.id + '" alt="Photo ' + (diapo + 1) + ' sur ' + m.length + ' du projet « ' + esc(p.titre) + ' »">';
    } else if (it.v.type === 'lien') {
      contenu = '<div class="app-video"><p>Cette vidéo est hébergée sur ' + esc(hote(it.v.url)) + '.</p><a class="fr-link" href="' + esc(it.v.url) + '" target="_blank" rel="noopener noreferrer" title="Ouvrir la vidéo ' + it.n + ' - nouvelle fenêtre">Ouvrir la vidéo ' + it.n + '</a></div>';
    } else if (sansClic(it.v)) {
      contenu = lecteurHTML(p, it, false);
    } else {
      contenu = '<div class="app-video">' + pictogramme('video') +
        '<button type="button" class="fr-btn app-lecture" data-lire="' + diapo + '">' + ICONE.lecture + 'Lancer la vidéo' + (videosValides(p).length > 1 ? ' ' + it.n : '') + '</button>' +
        '<p>Le lecteur ' + esc(nomLecteur(it.v)) + ' se charge et démarre après votre clic</p></div>';
    }
    return '<div class="app-scene">' + contenu +
      (m.length > 1 ? '<button type="button" class="app-nav app-nav--g" data-pas="-1" aria-label="Média précédent">' + ICONE.gauche + '</button>' +
        '<button type="button" class="app-nav app-nav--d" data-pas="1" aria-label="Média suivant">' + ICONE.droite + '</button>' +
        '<span class="app-diapo">' + (diapo + 1) + ' / ' + m.length + '</span>' : '') + '</div>';
  }

  function dessiner() {
    var p = res[cur];
    if (!p) { el.dlg.close(); return; }
    var m = medias(p), it = m[diapo];
    var lienVideo = (it && it.k === 'video' && it.v.type !== 'lien')
      ? '<p class="fr-text--sm app-lien-video"><a class="fr-link fr-link--sm" href="' + esc(it.v.url) + '" target="_blank" rel="noopener noreferrer" title="Ouvrir la vidéo ' + it.n + ' sur ' + esc(nomSite(it.v)) + ' - nouvelle fenêtre">Ouvrir la vidéo sur ' + esc(nomSite(it.v)) + '</a></p>' : '';
    el.corps.innerHTML = '<div class="app-galerie">' + scene(p, m) + lienVideo + '</div>' +
      '<div class="app-info">' +
        (p.balises.length ? '<ul class="fr-tags-group">' + p.balises.map(function (b) { return '<li><p class="fr-tag">' + esc(b) + '</p></li>'; }).join('') + '</ul>' : '') +
        '<h2 class="fr-h4" id="m-titre">' + esc(p.titre || 'Projet sans titre') + '</h2>' +
        (p.date ? '<p class="fr-text--xs app-date">Ajouté le ' + esc(Socle.formaterDate(p.date)) + '</p>' : '') +
        (p.description ? '<p class="app-desc">' + esc(p.description) + '</p>' : '') +
        (p.champs.length ? '<dl class="app-champs">' + p.champs.map(function (c) { return '<div><dt>' + esc(c.label) + '</dt><dd>' + esc(c.valeur) + '</dd></div>'; }).join('') + '</dl>' : '') +
      '</div>';
    el.prec.innerHTML = ICONE.gauche + '<span class="app-libelle">Projet précédent</span>';
    el.suiv.innerHTML = '<span class="app-libelle">Projet suivant</span>' + ICONE.droite;
    el.prec.disabled = cur === 0; el.suiv.disabled = cur === res.length - 1;
    el.prec.setAttribute('aria-label', 'Projet précédent'); el.suiv.setAttribute('aria-label', 'Projet suivant');
    el.pos.textContent = 'Projet ' + (cur + 1) + ' sur ' + res.length;
    if ($('img[data-piece]', el.corps)) lierImages(el.corps, true);
    var sc = $('.app-scene', el.corps);
    if (sc) swipe(sc);
  }

  function aller(pas) {
    var n = medias(res[cur]).length; if (!n) return;
    diapo = (diapo + pas + n) % n; dessiner();
  }

  function swipe(zone) {
    var x0 = null;
    zone.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    zone.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > CFG.seuilBalayagePx) aller(dx < 0 ? 1 : -1);
      x0 = null;
    });
  }

  function remplacerScene(zone, html) {
    var garde = '';
    zone.querySelectorAll('.app-nav, .app-diapo').forEach(function (n) { garde += n.outerHTML; });
    zone.innerHTML = html + garde;
  }
  // Vidéo impossible à lire : format non pris en charge par le navigateur, ou adresse inaccessible.
  function echecVideo(video) {
    var zone = video.closest('.app-scene');
    if (!zone) return;
    // Le lien « Ouvrir la vidéo sur … » reste affiché sous la galerie : on y renvoie la personne.
    remplacerScene(zone, '<div class="app-video" role="alert"><p class="app-erreur">Cette vidéo n’a pas pu être lue : son format n’est pas pris en charge par votre navigateur, ou son adresse est inaccessible. Vous pouvez l’ouvrir directement avec le lien situé sous ce cadre.</p></div>');
  }

  // Clic sur « Lancer la vidéo » : le lecteur d'un service tiers n'est inséré qu'à ce moment-là, et la lecture démarre.
  function lire(bouton) {
    var p = res[cur], it = medias(p)[+bouton.getAttribute('data-lire')];
    if (!it || it.k !== 'video') return;
    remplacerScene(bouton.closest('.app-scene'), lecteurHTML(p, it, true));
  }

  // ---------- événements ----------
  el.q.addEventListener('input', function () { clearTimeout(minuteur); minuteur = setTimeout(function () { etat.q = el.q.value; etat.page = 1; executer(); }, CFG.delaiSaisieMs); });
  $('#recherche').addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(minuteur); etat.q = el.q.value; etat.page = 1; executer(); });
  el.balise.addEventListener('change', function () { etat.balise = el.balise.value; etat.page = 1; executer(); });
  el.reinit.addEventListener('click', reinitialiser);

  el.liste.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ouvrir]'); if (b) { ouvrir(+b.getAttribute('data-ouvrir'), b); return; }
    if (e.target.closest('[data-reinit2]')) reinitialiser();
  });
  el.pagination.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-page]'); if (!a) return;
    e.preventDefault();
    etat.page = +a.getAttribute('data-page'); executer();
    el.liste.scrollIntoView({ block: 'start' });
    var premier = $('[data-ouvrir]', el.liste); if (premier) premier.focus({ preventScroll: true });
  });

  el.dlg.addEventListener('click', function (e) {
    if (e.target === el.dlg) { el.dlg.close(); return; }
    var pas = e.target.closest('[data-pas]'); if (pas) { aller(+pas.getAttribute('data-pas')); return; }
    var l = e.target.closest('[data-lire]'); if (l) lire(l);
  });
  el.dlg.addEventListener('keydown', function (e) {
    if (/^(INPUT|SELECT|TEXTAREA|SUMMARY|IFRAME|VIDEO)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') aller(1); else if (e.key === 'ArrowLeft') aller(-1);
  });
  $('#m-fermer').addEventListener('click', function () { el.dlg.close(); });
  el.prec.addEventListener('click', function () { cur--; diapo = 0; dessiner(); el.dlg.scrollTop = 0; });
  el.suiv.addEventListener('click', function () { cur++; diapo = 0; dessiner(); el.dlg.scrollTop = 0; });
  el.dlg.addEventListener('close', function () {
    el.corps.innerHTML = '';   // arrête toute vidéo en cours de lecture
    if (ouvreur && document.contains(ouvreur)) ouvreur.focus();
  });

  // ---------- données ----------
  function recevoir(liste, info) {
    var idOuvert = (el.dlg.open && res[cur]) ? res[cur].id : null;
    // Le libellé du filtre est celui de la colonne des balises dans la table.
    var colBalise = info && info.structure && info.structure.roles.balise;
    if (colBalise) $('label[for="balise"]').textContent = colBalise.label;
    projets = liste;
    tri = Socle.trierParDate(projets);
    majBalises();
    executer();
    if (idOuvert !== null) {
      cur = res.findIndex(function (p) { return p.id === idOuvert; });
      if (cur < 0) el.dlg.close(); else dessiner();
    }
  }

  Socle.demarrer({
    onProjets: recevoir,
    onErreur: function (message) {
      el.compteur.textContent = '';
      el.liste.innerHTML = '<div class="fr-alert fr-alert--info"><h3 class="fr-alert__title">Table non exploitable</h3><p>' + esc(message) + '</p></div>';
    }
  });
})();
