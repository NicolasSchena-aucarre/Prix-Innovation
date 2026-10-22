/*
 * Widget de gestion des projets — liste, ajout, modification, suppression
 * ------------------------------------------------------------------------
 * Ce widget n'est pas rattaché à la table des projets mais à une table réservée au propriétaire du document :
 * il lit et écrit la table des projets par son nom (réglage gestion.table de js/config.js). Grist ne lui pousse donc
 * pas les modifications faites ailleurs : la liste se recharge après chacune de ses écritures, à la demande
 * (bouton « Actualiser la liste ») et, si le réglage gestion.actualisationAuRetour est activé, quand l'onglet
 * redevient visible.
 *
 * Aucun nom de colonne n'est écrit ici : le formulaire se construit d'après la structure de la table (socle.js, champs.js).
 * Images (colonne d'illustration) et documents (colonne de précisions) : choisis dans le formulaire, envoyés dans les pièces
 * jointes du document seulement à l'enregistrement (js/photos.js) ; les images sont réduites avant l'envoi. La première image
 * illustre la carte du projet dans le widget de lecture.
 *
 * Écriture : grist.docApi.applyUserActions (AddRecord, UpdateRecord, RemoveRecord). Les droits de la personne qui utilise
 * le widget s'appliquent : une écriture refusée par les règles d'accès de Grist est signalée, rien n'est perdu.
 *
 * Scripts à charger avant ce fichier : grist-plugin-api.js, js/config.js, js/socle.js, js/champs.js, js/photos.js.
 */
(function () {
  'use strict';

  var S = window.Socle, C = window.Champs, P = window.Photos, grist = window.grist, esc = S.echapper;
  function $(id) { return document.getElementById(id); }
  var el = {
    compteur: $('g-compteur'), lecture: $('g-lecture'), bouton: $('g-actualiser'), ajouter: $('g-ajouter'), avis: $('g-avis'), liste: $('liste'),
    form: $('g-form'), formulaire: $('g-formulaire'), formTitre: $('g-form-titre'), formAvis: $('g-form-avis'), formChamps: $('g-form-champs'),
    formAnnuler: $('g-form-annuler'), formFermer: $('g-form-fermer'), formEnregistrer: $('g-form-enregistrer'),
    confirm: $('g-confirm'), confirmTitre: $('g-confirm-titre'), confirmTexte: $('g-confirm-texte'), confirmOui: $('g-confirm-oui'), confirmNon: $('g-confirm-non')
  };

  var g = null, acces = null, enCours = null, etat = null, compte = '';
  var saisie = null;   // formulaire ouvert : { mode, id, specs, avant, instantane, declencheur, occupe, forcer, pieces, tags, nouveaux, envoyes, noms, compteur }
  var accesEcriture = null;   // jeton qui permet d'envoyer des fichiers : demandé seulement au premier envoi
  function accesPourEnvoi() { return accesEcriture || (accesEcriture = new S.AccesPieces({ ecriture: true })); }

  // ---------- messages ----------
  function avis(niveau, titre, message) {
    el.avis.insertAdjacentHTML('beforeend',
      '<div class="fr-alert fr-alert--' + niveau + '"><h3 class="fr-alert__title">' + esc(titre) + '</h3>' + (message ? '<p>' + esc(message) + '</p>' : '') + '</div>');
  }

  function messageDe(e) { return (e && e.message) || String(e); }
  function nom(p) { return p && p.titre ? p.titre : 'Projet sans titre'; }
  function pluriel(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }

  // ---------- liste des projets ----------
  function tableDsfr(id, legende, entetes, lignes) {
    return '<div class="fr-table fr-table--multiline"><div class="fr-table__wrapper"><div class="fr-table__container" data-legende="' + id + '"><div class="fr-table__content">' +
      '<table><caption id="' + id + '">' + esc(legende) + '</caption><thead><tr>' +
      entetes.map(function (e) { return '<th scope="col"' + (e.classe ? ' class="' + e.classe + '"' : '') + '>' + esc(e.titre) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + lignes + '</tbody></table></div></div></div></div>';
  }

  function afficherListe(r) {
    var R = r.roles, projets = S.trierProjets(r.projets, 'recents');
    compte = projets.length === 0 ? 'Aucun projet' : pluriel(projets.length, 'projet');
    el.compteur.textContent = compte;
    if (!projets.length) { el.liste.innerHTML = '<p class="gest-vide">Aucun projet pour l’instant. Utilisez « Ajouter un projet » pour créer le premier.</p>'; return; }

    var cols = [{
      titre: R.titre.label, premiere: true,
      cellule: function (p) { return p.titre ? esc(p.titre) : '<span class="gest-sans-titre">Projet sans titre</span>'; }
    }];
    if (R.numero) cols.push({ titre: R.numero.label, cellule: function (p) { return p.numero ? esc(p.numero) : '—'; } });
    if (R.theme) cols.push({
      titre: R.theme.label,
      cellule: function (p) {
        return p.themes.length ? '<ul class="gest-balises">' + p.themes.map(function (b) { return '<li><p class="fr-tag fr-tag--sm">' + esc(b) + '</p></li>'; }).join('') + '</ul>' : '';
      }
    });
    if (R.illustration) cols.push({ titre: R.illustration.label, classe: 'gest-nombre', cellule: function (p) { return String(p.illustrations.length); } });
    if (R.precisions) cols.push({ titre: R.precisions.label, classe: 'gest-nombre', cellule: function (p) { return String(p.precisions.length); } });
    if (R.videos) cols.push({ titre: R.videos.label, classe: 'gest-nombre', cellule: function (p) { return String(p.videos.length); } });
    cols.push({
      titre: 'Actions', classe: 'gest-colonne-actions',
      cellule: function (p) {
        var t = esc(nom(p));
        return '<div class="gest-actions">' +
          '<button type="button" class="fr-btn fr-btn--tertiary fr-btn--sm" data-modifier="' + p.id + '" aria-label="Modifier le projet « ' + t + ' »">Modifier</button>' +
          '<button type="button" class="fr-btn fr-btn--tertiary fr-btn--sm" data-supprimer="' + p.id + '" aria-label="Supprimer le projet « ' + t + ' »">Supprimer</button></div>';
      }
    });

    var lignes = projets.map(function (p) {
      return '<tr>' + cols.map(function (c) {
        var cl = c.classe && c.classe !== 'gest-colonne-actions' ? ' class="' + c.classe + '"' : '';
        return c.premiere ? '<th scope="row">' + c.cellule(p) + '</th>' : '<td' + cl + '>' + c.cellule(p) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    el.liste.innerHTML = tableDsfr('g-t-liste', 'Liste des projets', cols, lignes);
  }

  // Un tableau plus large que l'écran défile horizontalement : la zone doit alors être atteignable au clavier.
  // (Le JavaScript du DSFR s'en charge normalement ; il n'est pas chargé ici.) On ne la rend focusable que si elle défile.
  function majDefilement() {
    Array.prototype.forEach.call(document.querySelectorAll('.fr-table__container'), function (c) {
      if (c.scrollWidth > c.clientWidth) {
        c.setAttribute('tabindex', '0'); c.setAttribute('role', 'region'); c.setAttribute('aria-labelledby', c.getAttribute('data-legende'));
      } else {
        c.removeAttribute('tabindex'); c.removeAttribute('role'); c.removeAttribute('aria-labelledby');
      }
    });
  }

  // ---------- lecture ----------
  function heure() {
    var c = S.config();
    return new Date().toLocaleTimeString(c.langue, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: c.fuseauHoraire });
  }

  function afficher(r) {
    etat = r;
    el.avis.innerHTML = '';
    afficherListe(r);
    majDefilement();
    el.ajouter.disabled = false;
    el.lecture.textContent = 'Données lues à ' + heure();
    if (r.projets.some(function (p) { return p.censures > 0; })) avis('warning', 'Des cellules sont masquées', 'Une règle d’accès masque certaines cellules pour votre compte : la liste est incomplète.');
  }

  function echec(e) {
    el.avis.innerHTML = '';
    avis('error', 'Impossible de lire la table « ' + g.table + ' »',
      messageDe(e) + ' Vérifiez le nom de la table (réglage gestion.table de js/config.js) et que le widget a l’accès complet au document.');
    el.compteur.textContent = etat ? compte : 'Lecture impossible';   // la liste déjà affichée reste valable
  }

  function charger() {
    if (enCours) return enCours;
    el.bouton.disabled = true;
    el.compteur.textContent = etat ? 'Actualisation…' : 'Chargement des projets…';
    enCours = S.lireTable(g.table, acces).then(afficher).catch(echec).then(function () {
      enCours = null;
      el.bouton.disabled = false;
    });
    return enCours;
  }

  // Relecture après une écriture : on attend la lecture éventuellement en cours, qui pourrait précéder l'écriture.
  function recharger() { return Promise.resolve(enCours).then(charger); }

  function projet(id) { return etat ? etat.projets.filter(function (p) { return p.id === id; })[0] : null; }
  function ligne(id) { return etat ? etat.brut.filter(function (r) { return r.id === id; })[0] : null; }

  // ---------- écriture ----------
  function ecrire(actions) { return grist.docApi.applyUserActions(actions); }

  // ---------- boîte de confirmation ----------
  // Renvoie une promesse : true si la personne confirme, false si elle annule (bouton Annuler ou touche Échap).
  function demander(o) {
    return new Promise(function (resolve) {
      el.confirmTitre.textContent = o.titre;
      el.confirmTexte.textContent = o.texte;
      el.confirmOui.textContent = o.oui;
      el.confirmNon.textContent = o.non || 'Annuler';
      function fini(v) {
        el.confirm.removeEventListener('cancel', annule);
        el.confirmOui.onclick = el.confirmNon.onclick = null;
        if (el.confirm.open) el.confirm.close();
        resolve(v);
      }
      function annule(e) { if (e.target !== el.confirm) return; e.preventDefault(); fini(false); }
      el.confirm.addEventListener('cancel', annule);
      el.confirmOui.onclick = function () { fini(true); };
      el.confirmNon.onclick = function () { fini(false); };
      el.confirm.showModal();
      el.confirmNon.focus();   // l'action par défaut est la plus sûre
    });
  }

  // ---------- formulaire : construction ----------
  function id(s, p) { return 'g-' + p + '-' + s.id; }

  function aideDe(s) {
    if (s.type === 'videos') return 'Une adresse web par ligne (commençant par http ou https).';
    if (s.type === 'decimal') return 'Exemple : 12,5';
    if (s.type === 'entier') return 'Exemple : 12';
    return '';
  }

  function etiquette(s) {
    var aide = aideDe(s);
    return esc(s.label) + (s.obligatoire ? '<span class="fr-hint-text">Obligatoire</span>' : '') + (aide ? '<span class="fr-hint-text">' + esc(aide) + '</span>' : '');
  }

  // Les deux sortes de pièces jointes du formulaire : images (illustration) et documents (précisions).
  var NAT = {
    photos: { mot: 'image', Mot: 'Image', det: 'l’image', de: 'd’image', e: 'e', aucun: 'Aucune image' },
    documents: { mot: 'document', Mot: 'Document', det: 'le document', de: 'de document', e: '', aucun: 'Aucun document' }
  };
  function estPiece(s) { return s.type === 'photos' || s.type === 'documents'; }

  // Aperçu d'une image : le fichier choisi (pas encore envoyé) ou la pièce jointe du document.
  function vignette(jeton) {
    var n = saisie && saisie.nouveaux[jeton], m = /^id:(\d+)$/.exec(jeton);
    if (n) return n.apercu;
    return m && acces.jeton ? acces.url(Number(m[1])) : '';
  }

  function nomPiece(jeton) {
    var n = saisie.nouveaux[jeton], m = /^id:(\d+)$/.exec(jeton), info = m ? saisie.noms[m[1]] : null;
    return n ? n.nom : (info ? info.nom : '');
  }

  function piecesListeHtml(s, jetons) {
    var nat = NAT[s.type];
    if (!jetons.length) return '<li class="gest-photos__vide">' + nat.aucun + ' pour l’instant.</li>';
    return jetons.map(function (j, i) {
      var nouvelle = j.indexOf('new:') === 0, n = i + 1, total = jetons.length;
      function bouton(action, texte, desactive) {
        return '<button type="button" class="fr-btn fr-btn--tertiary fr-btn--sm" data-photo-action="' + action + '" data-champ="' + esc(s.id) + '" data-index="' + i + '" aria-label="' + texte + ' ' + nat.det + ' ' + n + '"' + (desactive ? ' disabled' : '') + '>' + texte + '</button>';
      }
      var src = s.type === 'photos' ? vignette(j) : '', nom = s.type === 'documents' ? nomPiece(j) : '';
      var visuel = s.type === 'photos' ? '<div class="gest-photo__vignette" data-jeton="' + esc(j) + '">' + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" width="96" height="72">' : '<span>Aperçu indisponible</span>') + '</div>' : '';
      return '<li class="gest-photo">' + visuel +
        '<div class="gest-photo__corps"><p class="gest-photo__nom">' + nat.Mot + ' ' + n + ' sur ' + total +
        (s.type === 'photos' && i === 0 ? ' <span class="fr-badge fr-badge--sm fr-badge--info fr-badge--no-icon">Sur la carte</span>' : '') +
        (nouvelle ? ' <span class="gest-photo__nouvelle fr-badge fr-badge--sm fr-badge--blue-ecume fr-badge--no-icon">À enregistrer</span>' : '') + '</p>' +
        (s.type === 'documents' ? '<p class="gest-photo__fichier" data-jeton="' + esc(j) + '">' + esc(nom || 'Nom indisponible') + '</p>' : '') +
        '<div class="gest-photo__actions">' + bouton('monter', 'Monter', i === 0) + bouton('descendre', 'Descendre', i === total - 1) + bouton('retirer', 'Retirer', false) + '</div></div></li>';
    }).join('');
  }

  // Tags : des étiquettes que l'on ajoute une à une (Entrée ou bouton « Ajouter ») et que l'on retire d'un clic.
  function tagsListeHtml(s, tags) {
    if (!tags.length) return '<li class="gest-photos__vide">Aucun tag pour l’instant.</li>';
    return tags.map(function (t, i) {
      return '<li><button type="button" class="fr-tag fr-tag--dismiss" data-tag-retirer="' + esc(s.id) + '" data-index="' + i + '" aria-label="Retirer le tag « ' + esc(t) + ' »">' + esc(t) + '</button></li>';
    }).join('');
  }
  // Suggestions : les tags déjà employés par d'autres projets, pour garder des tags homogènes.
  function suggestionsTags(deja) {
    var vus = {}, out = [];
    ((etat && etat.projets) || []).forEach(function (p) { p.tags.forEach(function (t) { if (!vus[t] && deja.indexOf(t) === -1) { vus[t] = true; out.push(t); } }); });
    return out.sort(function (a, b) { return a.localeCompare(b, 'fr'); }).map(function (t) { return '<option value="' + esc(t) + '"></option>'; }).join('');
  }

  function champHtml(s, v) {
    var champ = id(s, 'f'), groupe = id(s, 'g'), req = s.obligatoire ? ' aria-required="true"' : '';
    switch (s.type) {
      case 'tags':
        return '<fieldset class="fr-fieldset gest-tags" id="' + groupe + '" aria-labelledby="' + id(s, 'l') + '"><legend class="fr-fieldset__legend fr-text--regular" id="' + id(s, 'l') + '">' + esc(s.label) +
          '<span class="fr-hint-text">Cliquez sur un tag pour le retirer.</span></legend>' +
          '<ul class="fr-tags-group gest-tags__liste" id="' + id(s, 'p') + '">' + tagsListeHtml(s, v) + '</ul>' +
          '<div class="gest-tags__saisie"><div class="fr-input-group"><label class="fr-label" for="' + champ + '">Ajouter un tag<span class="fr-hint-text">Saisissez le tag, puis validez avec Entrée ou avec le bouton « Ajouter ». Un tag peut être une phrase.</span></label>' +
          '<input class="fr-input" type="text" id="' + champ + '" name="' + esc(s.id) + '" data-tags="1" list="' + id(s, 'd') + '" autocomplete="off"></div>' +
          '<button type="button" class="fr-btn fr-btn--secondary" data-tag-ajouter="' + esc(s.id) + '" aria-label="Ajouter le tag saisi">Ajouter</button></div>' +
          '<datalist id="' + id(s, 'd') + '">' + suggestionsTags(v) + '</datalist><div class="gest-photos__etat" id="' + id(s, 's') + '" role="status"></div></fieldset>';
      case 'photos': case 'documents': {
        var nat = NAT[s.type], cfgp = S.configGestion(), photo = s.type === 'photos';
        var formats = photo ? cfgp.photos.formats : cfgp.documents.formats;
        var aide = photo
          ? 'Formats acceptés : ' + P.formatsAcceptes() + '. ' + cfgp.photos.poidsMaxSourceMo + ' Mo au maximum par fichier. Les images sont réduites avant l’envoi (' + cfgp.photos.largeurMaxPx + ' pixels au plus).'
          : 'Formats acceptés : ' + P.formatsDocuments() + '. ' + cfgp.documents.poidsMaxMo + ' Mo au maximum par fichier. Les documents sont envoyés tels quels.';
        return '<fieldset class="fr-fieldset gest-photos" id="' + groupe + '" aria-labelledby="' + id(s, 'l') + '"><legend class="fr-fieldset__legend fr-text--regular" id="' + id(s, 'l') + '">' + esc(s.label) +
          '<span class="fr-hint-text">' + (photo ? 'La première image illustre la carte du projet. Les boutons Monter et Descendre changent l’ordre.' : 'Les documents sont proposés en liens dans la fenêtre de détail, dans cet ordre.') + '</span></legend>' +
          '<ul class="gest-photos__liste" id="' + id(s, 'p') + '">' + piecesListeHtml(s, v) + '</ul>' +
          '<div class="fr-upload-group"><label class="fr-label" for="' + champ + '">Ajouter des ' + nat.mot + 's dans « ' + esc(s.label) + ' »<span class="fr-hint-text">' + esc(aide) + '</span></label>' +
          '<input class="fr-upload" type="file" id="' + champ + '" name="' + esc(s.id) + '" multiple accept="' + esc(formats.join(',')) + '"></div>' +
          '<div class="gest-photos__etat" id="' + id(s, 's') + '" role="status"></div></fieldset>';
      }
      case 'texte-long': case 'videos':
        return '<div class="fr-input-group" id="' + groupe + '"><label class="fr-label" for="' + champ + '">' + etiquette(s) + '</label>' +
          '<textarea class="fr-input" id="' + champ + '" name="' + esc(s.id) + '" rows="' + (s.type === 'videos' ? 3 : 4) + '"' + req + '>' + esc(v) + '</textarea></div>';
      case 'choix': {
        var options = '<option value="">Aucune valeur</option>' + s.choix.map(function (c) { return '<option value="' + esc(c) + '"' + (c === v ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
        if (v && s.choix.indexOf(v) === -1) options += '<option value="' + esc(v) + '" selected>' + esc(v) + ' (valeur absente de la liste)</option>';
        return '<div class="fr-select-group" id="' + groupe + '"><label class="fr-label" for="' + champ + '">' + etiquette(s) + '</label>' +
          '<select class="fr-select" id="' + champ + '" name="' + esc(s.id) + '">' + options + '</select></div>';
      }
      case 'choix-multiple':
        return '<fieldset class="fr-fieldset" id="' + groupe + '" aria-labelledby="' + id(s, 'l') + '"><legend class="fr-fieldset__legend fr-text--regular" id="' + id(s, 'l') + '">' + etiquette(s) + '</legend>' +
          s.choix.map(function (c, i) {
            return '<div class="fr-fieldset__element"><div class="fr-checkbox-group"><input type="checkbox" id="' + champ + '-' + i + '" name="' + esc(s.id) + '" value="' + esc(c) + '"' +
              (v.indexOf(c) !== -1 ? ' checked' : '') + '><label class="fr-label" for="' + champ + '-' + i + '">' + esc(c) + '</label></div></div>';
          }).join('') + '</fieldset>';
      case 'oui-non':
        return '<div class="fr-checkbox-group" id="' + groupe + '"><input type="checkbox" id="' + champ + '" name="' + esc(s.id) + '"' + (v ? ' checked' : '') + '><label class="fr-label" for="' + champ + '">' + esc(s.label) + '</label></div>';
      default: {
        var type = s.type === 'date' ? 'date' : s.type === 'date-heure' ? 'datetime-local' : 'text';
        var mode = s.type === 'entier' ? ' inputmode="numeric"' : s.type === 'decimal' ? ' inputmode="decimal"' : '';
        return '<div class="fr-input-group" id="' + groupe + '"><label class="fr-label" for="' + champ + '">' + etiquette(s) + '</label>' +
          '<input class="fr-input" type="' + type + '"' + mode + ' id="' + champ + '" name="' + esc(s.id) + '" value="' + esc(v) + '"' + req + '></div>';
      }
    }
  }

  // ---------- formulaire : lecture et erreurs ----------
  // Tags du projet, y compris celui que la personne a saisi sans l'ajouter : il ne doit pas se perdre à l'enregistrement.
  function tagsAvecSaisie(s) {
    var liste = saisie.tags[s.id].slice(), champ = $(id(s, 'f'));
    (champ ? S.separerTags(champ.value) : []).forEach(function (t) { if (liste.indexOf(t) === -1) liste.push(t); });
    return liste;
  }

  function lireFormulaire(specs) {
    var out = {};
    specs.forEach(function (s) {
      var champs = el.formChamps.querySelectorAll('[name="' + s.id + '"]');
      if (s.type === 'tags') out[s.id] = tagsAvecSaisie(s);
      else if (estPiece(s)) out[s.id] = saisie.pieces[s.id].slice();
      else if (s.type === 'oui-non') out[s.id] = !!(champs[0] && champs[0].checked);
      else if (s.type === 'choix-multiple') out[s.id] = Array.prototype.filter.call(champs, function (c) { return c.checked; }).map(function (c) { return c.value; });
      else out[s.id] = champs[0] ? champs[0].value : '';
    });
    return out;
  }

  function effacerErreurs() {
    el.formAvis.innerHTML = '';
    Array.prototype.forEach.call(el.formChamps.querySelectorAll('.fr-error-text'), function (n) { n.parentNode.removeChild(n); });
    Array.prototype.forEach.call(el.formChamps.querySelectorAll('[class*="--error"]'), function (n) { n.classList.remove('fr-input-group--error', 'fr-select-group--error', 'fr-fieldset--error'); });
    Array.prototype.forEach.call(el.formChamps.querySelectorAll('[aria-invalid]'), function (n) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
  }

  // Une erreur disparaît dès que la personne modifie le champ concerné.
  function effacerErreurDe(groupe) {
    if (!groupe || !groupe.id) return;
    groupe.classList.remove('fr-input-group--error', 'fr-select-group--error', 'fr-fieldset--error');
    // Les messages de refus d'un fichier (zone d'état des pièces jointes) ne sont pas des erreurs de saisie : ils restent affichés jusqu'au choix suivant.
    Array.prototype.forEach.call(groupe.querySelectorAll('.fr-error-text'), function (n) { if (!n.closest('.gest-photos__etat')) n.parentNode.removeChild(n); });
    Array.prototype.forEach.call(groupe.querySelectorAll('[aria-invalid]'), function (n) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
    if (!el.formChamps.querySelector('.fr-error-text:not(.gest-photos__etat .fr-error-text)')) el.formAvis.innerHTML = '';   // plus aucune erreur : le résumé n'a plus lieu d'être
  }

  function erreurChamp(s, message) {
    var groupe = $(id(s, 'g')), msg = id(s, 'e');
    var classe = s.type === 'choix' ? 'fr-select-group--error' : s.type === 'choix-multiple' ? 'fr-fieldset--error' : 'fr-input-group--error';
    groupe.classList.add(classe);
    groupe.insertAdjacentHTML('beforeend', '<p class="fr-error-text" id="' + msg + '">' + esc(message) + '</p>');
    Array.prototype.forEach.call(groupe.querySelectorAll('input, select, textarea'), function (c) { c.setAttribute('aria-invalid', 'true'); c.setAttribute('aria-describedby', msg); });
    return groupe.querySelector('input, select, textarea');
  }

  function avisFormulaire(niveau, titre, message, actions) {
    el.formAvis.innerHTML = '<div class="fr-alert fr-alert--' + niveau + '" role="alert"><h4 class="fr-alert__title">' + esc(titre) + '</h4>' + (message ? '<p>' + esc(message) + '</p>' : '') + (actions || '') + '</div>';
  }

  // Numéro du projet : calculé par Grist à la création, affiché pour information, jamais modifiable (ce n'est pas un champ du formulaire).
  function numeroHtml(mode, ligneProjet) {
    var col = etat.roles.numero;
    if (!col) return '';
    var valeur = mode === 'modif' ? S.texte(ligneProjet[col.id]).trim() : '';
    return '<p class="gest-numero"><span class="gest-numero__label">' + esc(col.label) + '</span> ' +
      (valeur ? '<strong>' + esc(valeur) + '</strong>' : '<span class="gest-numero__attente">' + (mode === 'ajout' ? 'attribué automatiquement à l’enregistrement' : 'pas encore attribué') + '</span>') + '</p>';
  }

  // ---------- formulaire : ouverture et fermeture ----------
  function ouvrir(mode, idProjet, declencheur) {
    if (!etat) return;
    var l = mode === 'modif' ? ligne(idProjet) : null;
    if (mode === 'modif' && !l) { avis('error', 'Ce projet n’existe plus', 'Actualisez la liste : il a peut-être été supprimé.'); return; }
    var specs = C.champs(etat.structure, etat.roles).map(function (s) { return Object.assign({}, s); });
    if (!specs.length) { avis('warning', 'Aucun champ modifiable', 'Aucune colonne de la table ne peut être saisie dans le formulaire.'); return; }
    var avant = l ? C.valeursDe(specs, l) : C.valeursVides(specs);
    specs.forEach(function (s) { if (s.type === 'choix') s.valeurActuelle = avant[s.id]; });   // une valeur déjà présente reste valable, même absente de la liste
    liberer();
    saisie = { mode: mode, id: idProjet, specs: specs, avant: JSON.parse(JSON.stringify(avant)), instantane: l ? C.empreinte(specs, l) : null, declencheur: declencheur || null, occupe: false, forcer: false,
      pieces: {}, tags: {}, nouveaux: {}, envoyes: {}, noms: {}, compteur: 0 };
    specs.forEach(function (s) { if (estPiece(s)) saisie.pieces[s.id] = avant[s.id].slice(); if (s.type === 'tags') saisie.tags[s.id] = avant[s.id].slice(); });
    el.formTitre.textContent = mode === 'ajout' ? 'Ajouter un projet' : 'Modifier le projet';
    el.formAvis.innerHTML = '';
    el.formChamps.innerHTML = numeroHtml(mode, l) + specs.map(function (s) { return champHtml(s, avant[s.id]); }).join('');
    el.formEnregistrer.disabled = false;
    el.formEnregistrer.textContent = 'Enregistrer';
    if (!el.form.open) el.form.showModal();
    var premier = el.formChamps.querySelector('input, select, textarea');
    if (premier) premier.focus();
    // Aperçus des images et noms des documents : ils ont besoin du jeton d'accès, qui arrive après l'ouverture du formulaire.
    var ouverture = saisie;
    acces.obtenir().then(function () {
      if (saisie !== ouverture) return;
      saisie.specs.forEach(function (s) { if (s.type === 'photos') majApercus(s); });
      saisie.specs.filter(function (s) { return s.type === 'documents'; }).forEach(function (s) {
        saisie.pieces[s.id].forEach(function (jeton) {
          var m = /^id:(\d+)$/.exec(jeton);
          if (m) P.infosDocument(Number(m[1]), acces).then(function (info) { if (info && saisie === ouverture) { saisie.noms[m[1]] = info; majApercus(s); } });
        });
      });
    }, function () {});
  }

  // Libère les aperçus des photos choisies mais pas enregistrées.
  function liberer() {
    if (saisie) Object.keys(saisie.nouveaux).forEach(function (k) { URL.revokeObjectURL(saisie.nouveaux[k].apercu); });
  }

  function fermer(retourFocus) {
    var d = saisie && saisie.declencheur;
    liberer();
    saisie = null;
    if (el.form.open) el.form.close();
    if (retourFocus !== false && d && document.body.contains(d)) d.focus();
  }

  function modifie() { return !!saisie && C.champsModifies(saisie.specs, saisie.avant, lireFormulaire(saisie.specs)).length > 0; }

  function demanderFermeture() {
    if (!saisie || saisie.occupe) return;
    if (!modifie()) { fermer(); return; }
    demander({ titre: 'Abandonner les modifications ?', texte: 'Les changements que vous avez saisis ne sont pas enregistrés et seront perdus.', oui: 'Abandonner les modifications', non: 'Continuer la saisie' })
      .then(function (oui) { if (oui) fermer(); });
  }

  // ---------- formulaire : tags ----------
  function specTags(idChamp) { return saisie.specs.filter(function (s) { return s.id === idChamp; })[0]; }
  function majTags(s) {
    var ul = $(id(s, 'p')), liste = $(id(s, 'd'));
    if (ul) ul.innerHTML = tagsListeHtml(s, saisie.tags[s.id]);
    if (liste) liste.innerHTML = suggestionsTags(saisie.tags[s.id]);
  }

  // Ajoute des tags à la liste. « champ » : le champ de saisie (vidé et remis au premier plan), absent quand les tags viennent d'un collage.
  function ajouterListeTags(s, saisis, champ) {
    var liste = saisie.tags[s.id], nouveaux = [], doublons = [];
    if (!saisis.length) { annoncer(s, '<p class="fr-error-text">Saisissez un tag avant de valider.</p>'); if (champ) champ.focus(); return; }
    saisis.forEach(function (t) { if (liste.indexOf(t) === -1) nouveaux.push(t); else doublons.push(t); });
    saisie.tags[s.id] = liste.concat(nouveaux);
    if (champ) champ.value = '';
    majTags(s);
    annoncer(s, '<p>' + esc((nouveaux.length ? (nouveaux.length === 1 ? 'Tag « ' + nouveaux[0] + ' » ajouté.' : nouveaux.length + ' tags ajoutés.') : '') +
      (doublons.length ? (nouveaux.length ? ' ' : '') + (doublons.length === 1 ? '« ' + doublons[0] + ' » est déjà dans la liste.' : doublons.length + ' tags étaient déjà dans la liste.') : '')) + '</p>');
    (champ || $(id(s, 'f'))).focus();
  }
  function ajouterTags(s) { var champ = $(id(s, 'f')); ajouterListeTags(s, S.separerTags(champ.value), champ); }

  function retirerTag(b) {
    var s = specTags(b.getAttribute('data-tag-retirer')), i = Number(b.getAttribute('data-index')), liste = saisie.tags[s.id], t = liste[i];
    saisie.tags[s.id] = liste.filter(function (_, k) { return k !== i; });
    majTags(s);
    annoncer(s, '<p>' + esc('Tag « ' + t + ' » retiré. ' + (liste.length === 1 ? 'Il n’y a plus de tag.' : 'Il reste ' + pluriel(liste.length - 1, 'tag') + '.')) + '</p>');
    var reste = saisie.tags[s.id].length, suivant = reste ? el.formChamps.querySelector('[data-tag-retirer="' + s.id + '"][data-index="' + Math.min(i, reste - 1) + '"]') : null;
    (suivant || $(id(s, 'f'))).focus();
  }

  // ---------- formulaire : images et documents ----------
  function specPiece(idChamp) { return saisie.specs.filter(function (s) { return s.id === idChamp; })[0]; }
  function annoncer(s, html) { $(id(s, 's')).innerHTML = html; }
  // Aperçus et noms arrivés après l'ouverture : on complète le contenu sans redessiner la liste, pour ne jamais faire perdre le focus.
  function majApercus(s) {
    var ul = $(id(s, 'p'));
    if (!ul) return;
    Array.prototype.forEach.call(ul.querySelectorAll('[data-jeton]'), function (n) {
      var jeton = n.getAttribute('data-jeton');
      if (n.classList.contains('gest-photo__vignette')) {
        var src = vignette(jeton);
        if (src && !n.querySelector('img')) n.innerHTML = '<img src="' + esc(src) + '" alt="" loading="lazy" width="96" height="72">';
      } else {
        var nom = nomPiece(jeton);
        if (nom) n.textContent = nom;
      }
    });
  }
  function majPieces(s) { var ul = $(id(s, 'p')); if (ul) ul.innerHTML = piecesListeHtml(s, saisie.pieces[s.id]); }
  function bouton(s, action, index) { return el.formChamps.querySelector('[data-champ="' + s.id + '"][data-photo-action="' + action + '"][data-index="' + index + '"]'); }

  function actionPiece(b) {
    var s = specPiece(b.getAttribute('data-champ')), i = Number(b.getAttribute('data-index')), action = b.getAttribute('data-photo-action'), nat = NAT[s.type];
    var liste = saisie.pieces[s.id], total = liste.length, cible;
    if (action === 'retirer') {
      var j = liste[i];
      if (saisie.nouveaux[j]) { URL.revokeObjectURL(saisie.nouveaux[j].apercu); delete saisie.nouveaux[j]; delete saisie.envoyes[j]; }
      saisie.pieces[s.id] = P.retirer(liste, i);
      majPieces(s);
      annoncer(s, '<p>' + esc(nat.Mot + ' ' + (i + 1) + ' retiré' + nat.e + ' du projet. ' + (total === 1 ? 'Il n’y a plus ' + nat.de + '.' : 'Il reste ' + pluriel(total - 1, nat.mot) + '.')) + '</p>');
      var reste = saisie.pieces[s.id].length;
      (reste ? bouton(s, 'retirer', Math.min(i, reste - 1)) : $(id(s, 'f'))).focus();
      return;
    }
    var d = action === 'monter' ? -1 : 1;
    cible = i + d;
    saisie.pieces[s.id] = P.deplacer(liste, i, d);
    majPieces(s);
    annoncer(s, '<p>' + esc(nat.Mot + ' ' + (i + 1) + ' déplacé' + nat.e + ' en position ' + (cible + 1) + ' sur ' + total + '.') + '</p>');
    // Le bouton peut être désactivé en bout de liste : le focus passe alors à l'autre sens, sans quitter la pièce.
    var suite = bouton(s, action, cible);
    if (!suite || suite.disabled) suite = bouton(s, action === 'monter' ? 'descendre' : 'monter', cible);
    if (suite) suite.focus();
  }

  function choisirFichiers(input) {
    var s = specPiece(input.name), nat = NAT[s.type], fichiers = Array.prototype.slice.call(input.files), refus = [], ajoutees = 0;
    input.value = '';   // permet de choisir de nouveau le même fichier
    if (!fichiers.length) return;
    var zone = $(id(s, 's'));
    zone.setAttribute('aria-busy', 'true');
    zone.innerHTML = '<p>Préparation des fichiers…</p>';
    fichiers.reduce(function (chaine, f) {
      return chaine.then(function () {
        return (s.type === 'photos' ? P.reduire(f) : P.preparerDocument(f)).then(function (ph) {
          if (!saisie) return;
          var jeton = 'new:' + (++saisie.compteur);
          saisie.nouveaux[jeton] = { blob: ph.blob, nom: ph.nom, apercu: s.type === 'photos' ? URL.createObjectURL(ph.blob) : '' };
          saisie.pieces[s.id].push(jeton);
          ajoutees++;
        }, function (e) { refus.push('« ' + f.name + ' » : ' + messageDe(e)); });
      });
    }, Promise.resolve()).then(function () {
      if (!saisie) return;
      majPieces(s);
      zone.removeAttribute('aria-busy');
      zone.innerHTML = (ajoutees ? '<p>' + esc(pluriel(ajoutees, nat.mot) + (ajoutees > 1 ? ' ajouté' + nat.e + 's' : ' ajouté' + nat.e) + ' à la liste. ' + (ajoutees > 1 ? (nat.e ? 'Elles seront envoyées' : 'Ils seront envoyés') : (nat.e ? 'Elle sera envoyée' : 'Il sera envoyé')) + ' à l’enregistrement.') + '</p>' : '') +
        refus.map(function (r) { return '<p class="fr-error-text">' + esc(r) + '</p>'; }).join('');
    });
  }

  // Les fichiers choisis mais pas encore envoyés sont envoyés un à un ; on renvoie les valeurs du formulaire avec leur numéro de pièce jointe.
  function avecJetons(valeurs, f) {
    var out = Object.assign({}, valeurs);
    saisie.specs.forEach(function (s) { if (estPiece(s)) out[s.id] = valeurs[s.id].map(function (j) { return j.indexOf('new:') === 0 ? f(j) : j; }); });
    return out;
  }

  function envoyerFichiers(valeurs) {
    var aEnvoyer = [], fait = 0;
    saisie.specs.forEach(function (s) { if (estPiece(s)) valeurs[s.id].forEach(function (j) { if (j.indexOf('new:') === 0 && !saisie.envoyes[j]) aEnvoyer.push(j); }); });   // déjà envoyé lors d'un essai précédent : pas de doublon
    return aEnvoyer.reduce(function (chaine, j) {
      return chaine.then(function () {
        fait++;
        el.formAvis.innerHTML = '<div class="fr-alert fr-alert--info fr-alert--sm" role="status"><p>' + esc('Envoi du fichier ' + fait + ' sur ' + aEnvoyer.length + '…') + '</p></div>';
        return P.televerser(saisie.nouveaux[j], accesPourEnvoi()).then(function (idPiece) { saisie.envoyes[j] = idPiece; }, function (e) {
          var err = new Error('« ' + saisie.nouveaux[j].nom + ' » : ' + messageDe(e));
          err.titre = 'L’envoi d’un fichier a échoué';
          throw err;
        });
      });
    }, Promise.resolve()).then(function () { return avecJetons(valeurs, function (j) { return 'id:' + saisie.envoyes[j]; }); });
  }

  // ---------- formulaire : enregistrement ----------
  function occupe(oui) {
    if (!saisie) return;
    saisie.occupe = oui;
    el.formEnregistrer.disabled = oui;
    el.formEnregistrer.textContent = oui ? 'Enregistrement…' : 'Enregistrer';
  }

  function refuse(e) {
    occupe(false);
    if (e && e.titre) avisFormulaire('error', e.titre, messageDe(e) + ' Vos saisies sont conservées : vous pouvez réessayer.');
    else avisFormulaire('error', 'L’enregistrement a échoué', 'Grist a répondu : ' + messageDe(e) + ' Vos saisies sont conservées : vous pouvez corriger ou réessayer.');
  }

  // Après une écriture réussie : on referme, on relit la table, puis on annonce le résultat.
  function reussi(titre, message, retour, nouvelId) {
    var d = saisie && saisie.declencheur;
    fermer(false);
    return recharger().then(function () {
      var l = nouvelId != null ? ligne(nouvelId) : null, col = etat && etat.roles.numero, n = l && col ? S.texte(l[col.id]).trim() : '';
      avis('success', titre, message + (n ? ' ' + col.label + ' attribué : ' + n + '.' : ''));
      var cible = retour === 'ligne' && d && d.getAttribute('data-modifier') ? el.liste.querySelector('[data-modifier="' + d.getAttribute('data-modifier') + '"]') : null;
      (cible || el.ajouter).focus();
    });
  }

  function afficherConflit(raison, relue) {
    if (raison === 'supprime') {
      occupe(false);
      el.formEnregistrer.disabled = true;
      avisFormulaire('error', 'Ce projet n’existe plus', 'Il a été supprimé depuis l’ouverture du formulaire. Fermez cette fenêtre pour revenir à la liste.');
      return;
    }
    occupe(false);
    avisFormulaire('warning', 'Ce projet a été modifié depuis l’ouverture du formulaire',
      'Enregistrer maintenant remplacerait, pour les champs que vous avez modifiés, les valeurs qui viennent d’être saisies ailleurs.',
      '<div class="gest-conflit"><button type="button" class="fr-btn fr-btn--sm" id="g-conflit-forcer">Enregistrer quand même</button>' +
      '<button type="button" class="fr-btn fr-btn--secondary fr-btn--sm" id="g-conflit-recharger">Recharger la fiche</button></div>');
    $('g-conflit-forcer').onclick = function () { saisie.forcer = true; el.formulaire.requestSubmit(); };
    $('g-conflit-recharger').onclick = function () {
      var d = saisie.declencheur, idProjet = saisie.id;
      etat = relue; afficher(relue);
      ouvrir('modif', idProjet, d);
    };
    $('g-conflit-recharger').focus();
  }

  function enregistrer(ev) {
    ev.preventDefault();
    if (!saisie || saisie.occupe) return;
    effacerErreurs();
    var valeurs = lireFormulaire(saisie.specs), r = C.encoderTout(saisie.specs, avecJetons(valeurs, function () { return 'id:0'; })), ids = Object.keys(r.erreurs);   // une photo à envoyer compte comme valide
    if (ids.length) {
      var premier = null;
      saisie.specs.forEach(function (s) { if (r.erreurs[s.id]) { var c = erreurChamp(s, r.erreurs[s.id]); premier = premier || c; } });
      avisFormulaire('error', ids.length > 1 ? 'Le formulaire contient ' + ids.length + ' erreurs' : 'Le formulaire contient une erreur', 'Corrigez les champs signalés, puis enregistrez de nouveau.');
      if (premier) premier.focus();
      return;
    }

    var changes = saisie.mode === 'modif' ? C.champsModifies(saisie.specs, saisie.avant, valeurs) : null;
    if (changes && !changes.length) {
      fermer();
      avis('info', 'Aucune modification', 'Aucun champ n’a changé : rien n’a été enregistré.');
      return;
    }
    occupe(true);
    envoyerFichiers(valeurs).then(function (finales) {
      el.formAvis.innerHTML = '';
      if (saisie.mode === 'ajout') {
        var creation = C.valeursACreer(saisie.specs, finales);
        return ecrire([['AddRecord', g.table, null, creation.fields]]).then(function (res) {
          var t = creation.fields[etat.roles.titre && etat.roles.titre.id], nouvelId = res && res.retValues ? res.retValues[0] : null;
          return reussi('Projet ajouté', t ? '« ' + t + ' » a été ajouté à la liste.' : 'Le projet a été ajouté à la liste.', 'ajouter', nouvelId);
        });
      }
      var encodees = C.encoderTout(saisie.specs, finales).valeurs, fields = {};
      changes.forEach(function (c) { fields[c] = encodees[c]; });
      // On relit la table juste avant d'écrire : si le projet a changé ailleurs entre-temps, on prévient au lieu d'écraser.
      return S.lireTable(g.table, acces).then(function (relue) {
        var actuelle = relue.brut.filter(function (x) { return x.id === saisie.id; })[0];
        if (!actuelle) return afficherConflit('supprime', relue);
        if (!saisie.forcer && C.empreinte(saisie.specs, actuelle) !== saisie.instantane) return afficherConflit('modifie', relue);
        return ecrire([['UpdateRecord', g.table, saisie.id, fields]]).then(function () {
          var t = fields[etat.roles.titre && etat.roles.titre.id] || nom(projet(saisie.id));
          return reussi('Projet modifié', '« ' + t + ' » a été enregistré.', 'ligne');
        });
      });
    }).catch(refuse);
  }

  // ---------- suppression ----------
  function supprimer(idProjet, declencheur) {
    var p = projet(idProjet);
    if (!p) { avis('error', 'Ce projet n’existe plus', 'Actualisez la liste : il a peut-être déjà été supprimé.'); return; }
    var contenu = [];
    if (p.illustrations.length) contenu.push(pluriel(p.illustrations.length, 'image'));
    if (p.precisions.length) contenu.push(pluriel(p.precisions.length, 'document'));
    if (p.videos.length) contenu.push(pluriel(p.videos.length, 'vidéo'));
    demander({
      titre: 'Supprimer ce projet ?',
      texte: '« ' + nom(p) + ' » sera supprimé définitivement' + (contenu.length ? ' (il comprend ' + contenu.join(' et ') + ')' : '') + '. Cette action est irréversible.',
      oui: 'Supprimer définitivement', non: 'Annuler'
    }).then(function (oui) {
      if (!oui) { if (document.body.contains(declencheur)) declencheur.focus(); return; }
      declencheur.disabled = true;
      return ecrire([['RemoveRecord', g.table, idProjet]]).then(function () {
        return recharger().then(function () { avis('success', 'Projet supprimé', '« ' + nom(p) + ' » a été supprimé.'); el.ajouter.focus(); });
      }).catch(function (e) {
        declencheur.disabled = false;
        avis('error', 'La suppression a échoué', 'Grist a répondu : ' + messageDe(e));
      });
    });
  }

  // ---------- démarrage ----------
  // Un seul grist.ready(), avec le niveau d'accès le plus large dont le widget a besoin : l'écriture exige « full ».
  grist.ready({ requiredAccess: 'full' });
  try { g = S.configGestion(); }
  catch (e) {
    avis('error', 'Réglages invalides', e.message);
    el.compteur.textContent = 'Le widget ne peut pas démarrer';
    return;
  }
  acces = new S.AccesPieces();
  el.bouton.addEventListener('click', charger);
  el.ajouter.addEventListener('click', function () { ouvrir('ajout', null, el.ajouter); });
  el.liste.addEventListener('click', function (ev) {
    var m = ev.target.closest('[data-modifier]'), s = ev.target.closest('[data-supprimer]');
    if (m) ouvrir('modif', Number(m.getAttribute('data-modifier')), m);
    else if (s) supprimer(Number(s.getAttribute('data-supprimer')), s);
  });
  el.formulaire.addEventListener('submit', enregistrer);
  el.formChamps.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-photo-action]'), a = ev.target.closest('[data-tag-ajouter]'), r = ev.target.closest('[data-tag-retirer]');
    if (b && !b.disabled) actionPiece(b);
    else if (a) ajouterTags(specTags(a.getAttribute('data-tag-ajouter')));
    else if (r) retirerTag(r);
  });
  // Une liste collée (un tag par ligne, depuis un tableur par exemple) devient autant de tags : un champ sur une seule ligne
  // supprimerait les retours à la ligne et fusionnerait les tags.
  el.formChamps.addEventListener('paste', function (ev) {
    if (!ev.target.getAttribute || !ev.target.getAttribute('data-tags') || !ev.clipboardData) return;
    var texte = ev.clipboardData.getData('text');
    if (!/[\r\n]/.test(texte)) return;   // une seule ligne : collage ordinaire
    ev.preventDefault();
    ajouterListeTags(specTags(ev.target.name), S.separerTags(texte), ev.target);
  });
  el.formChamps.addEventListener('keydown', function (ev) {   // Entrée ajoute le tag saisi au lieu d'enregistrer le formulaire
    if (ev.key === 'Enter' && ev.target.getAttribute && ev.target.getAttribute('data-tags')) { ev.preventDefault(); ajouterTags(specTags(ev.target.name)); }
  });
  el.formChamps.addEventListener('change', function (ev) { if (ev.target.type === 'file') choisirFichiers(ev.target); });
  el.formChamps.addEventListener('error', function (ev) {   // aperçu impossible (pièce jointe qui n'est pas une image, jeton expiré…)
    if (ev.target.tagName === 'IMG') ev.target.parentNode.innerHTML = '<span>Aperçu indisponible</span>';
  }, true);
  ['input', 'change'].forEach(function (nomEv) {
    el.formChamps.addEventListener(nomEv, function (ev) { effacerErreurDe(ev.target.closest('.fr-input-group, .fr-select-group, .fr-fieldset')); });
  });
  el.formAnnuler.addEventListener('click', demanderFermeture);
  el.formFermer.addEventListener('click', demanderFermeture);
  // Touche Échap sur la fenêtre. Le sélecteur de fichiers émet lui aussi un événement « cancel » (bouton Annuler du navigateur), qui
  // remonte jusqu'ici : il ne doit pas être pris pour une annulation du formulaire.
  el.form.addEventListener('cancel', function (ev) { if (ev.target !== el.form) return; ev.preventDefault(); demanderFermeture(); });   // touche Échap
  window.addEventListener('resize', majDefilement);
  if (g.actualisationAuRetour) {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && etat) charger(); });
  }
  charger();
})();
