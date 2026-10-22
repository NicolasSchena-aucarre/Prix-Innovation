/*
 * Images et documents du formulaire de gestion : contrôle, réduction des images, envoi vers Grist, ordre
 * -------------------------------------------------------------------------------
 * L'API de Grist ne fournit pas de vignettes : la photo envoyée est celle que le widget de lecture affichera. Elle est donc
 * réduite dans le navigateur avant l'envoi, selon les réglages de la section gestion.photos de js/config.js.
 *
 * Une photo du formulaire est représentée par un « jeton » : « id:29 » pour une pièce jointe déjà dans le document,
 * « new:1 » pour un fichier choisi mais pas encore envoyé. L'envoi n'a lieu qu'à l'enregistrement : si la personne
 * annule, rien n'a été envoyé.
 *
 * Envoi : POST {adresse du document}/attachments, formulaire multipart (champ « upload »), en-tête X-Requested-With, jeton
 * d'accès en paramètre « auth ». L'adresse et le jeton viennent de Socle.AccesPieces({ ecriture: true }), qui corrige
 * l'identifiant du document (voir socle.js).
 *
 * Scripts à charger avant ce fichier : js/config.js et js/socle.js.
 */
(function (global) {
  'use strict';

  var S = global.Socle;
  var EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

  // « image/jpeg » -> « JPEG », « image/webp » -> « WebP » (pour les messages).
  function formatLisible(type) {
    var t = String(type).split('/')[1] || type;
    return t === 'webp' ? 'WebP' : t.toUpperCase();
  }
  function formatsAcceptes() { return S.configGestion().photos.formats.map(formatLisible).join(', '); }

  // ---------- ordre ----------
  // Fonctions pures : elles renvoient une nouvelle liste, la liste d'origine n'est jamais modifiée.
  function deplacer(liste, index, decalage) {
    var cible = index + decalage;
    if (index < 0 || index >= liste.length || cible < 0 || cible >= liste.length) return liste.slice();
    var copie = liste.slice(), x = copie.splice(index, 1)[0];
    copie.splice(cible, 0, x);
    return copie;
  }
  function retirer(liste, index) { return liste.filter(function (_, i) { return i !== index; }); }

  // ---------- réduction ----------
  function decoder(fichier) {
    function viaImage() {
      return new Promise(function (ok, ko) {
        var url = URL.createObjectURL(fichier), img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); ok(img); };
        img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Ce fichier n’est pas une image lisible.')); };
        img.src = url;
      });
    }
    if (typeof global.createImageBitmap !== 'function') return viaImage();
    // L'orientation enregistrée par l'appareil photo (EXIF) est appliquée : une photo prise en portrait reste en portrait.
    return global.createImageBitmap(fichier, { imageOrientation: 'from-image' }).catch(viaImage);
  }

  function nomDe(fichier, type) {
    var base = String(fichier.name || '').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 80);
    return (base || 'photo') + (EXTENSIONS[type] || '');
  }

  // Contrôle le fichier, le réduit si besoin et renvoie { blob, nom, type, largeur, hauteur, poidsOrigine, poids, inchange }.
  // En cas de refus, la promesse est rejetée avec un message prêt à être affiché.
  function reduire(fichier) {
    var p = S.configGestion().photos;
    if (p.formats.indexOf(fichier.type) === -1) return Promise.reject(new Error('format non accepté (formats acceptés : ' + formatsAcceptes() + ').'));
    if (fichier.size > p.poidsMaxSourceMo * 1024 * 1024) {
      return Promise.reject(new Error('fichier trop lourd (' + Math.round(fichier.size / 1048576) + ' Mo, maximum ' + p.poidsMaxSourceMo + ' Mo).'));
    }
    var echelle = 1, L = 0, H = 0;
    return decoder(fichier).then(function (img) {
      echelle = Math.min(1, p.largeurMaxPx / Math.max(img.width, img.height));   // jamais d'agrandissement
      L = Math.max(1, Math.round(img.width * echelle)); H = Math.max(1, Math.round(img.height * echelle));
      var canvas = document.createElement('canvas'), ctx;
      canvas.width = L; canvas.height = H;
      ctx = canvas.getContext('2d');
      if (p.formatSortie === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, L, H); }   // le JPEG n'a pas de transparence
      ctx.drawImage(img, 0, 0, L, H);
      if (typeof img.close === 'function') img.close();
      return new Promise(function (ok, ko) {
        canvas.toBlob(function (b) { if (b) ok(b); else ko(new Error('la photo n’a pas pu être préparée.')); }, p.formatSortie, p.qualite);
      });
    }).then(function (blob) {
      // Une photo déjà aux bonnes dimensions que la réduction n'allège pas est gardée telle quelle.
      if (echelle === 1 && blob.size >= fichier.size) {
        return { blob: fichier, nom: nomDe(fichier, fichier.type), type: fichier.type, largeur: L, hauteur: H, poidsOrigine: fichier.size, poids: fichier.size, inchange: true };
      }
      return { blob: blob, nom: nomDe(fichier, blob.type), type: blob.type, largeur: L, hauteur: H, poidsOrigine: fichier.size, poids: blob.size, inchange: false };
    });
  }

  // ---------- documents ----------
  // Un document (PDF…) est envoyé tel quel : on contrôle seulement son type et son poids.
  function formatsDocuments() { return S.configGestion().documents.formats.map(formatLisible).join(', '); }
  function preparerDocument(fichier) {
    var d = S.configGestion().documents;
    if (d.formats.indexOf(fichier.type) === -1) return Promise.reject(new Error('format non accepté (formats acceptés : ' + formatsDocuments() + ').'));
    if (fichier.size > d.poidsMaxMo * 1024 * 1024) return Promise.reject(new Error('fichier trop lourd (' + Math.round(fichier.size / 1048576) + ' Mo, maximum ' + d.poidsMaxMo + ' Mo).'));
    return Promise.resolve({ blob: fichier, nom: String(fichier.name || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || 'document', type: fichier.type, poids: fichier.size, inchange: true });
  }

  // Nom et poids d'un document déjà dans le document Grist ; null si Grist ne les donne pas.
  function infosDocument(id, acces) {
    return acces.obtenir().then(function () {
      return global.fetch(acces.urlMeta(id));
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.fileName ? { nom: String(j.fileName), taille: Number(j.fileSize) || 0 } : null; })
      .catch(function () { return null; });
  }

  // ---------- envoi ----------
  // Envoie une photo dans les pièces jointes du document ; renvoie le numéro de la pièce jointe.
  function televerser(photo, acces) {
    return acces.obtenir().then(function () {
      var f = new FormData();
      f.append('upload', photo.blob, photo.nom);
      return global.fetch(acces.urlDepot() + '?auth=' + encodeURIComponent(acces.jeton), { method: 'POST', body: f, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .catch(function () { throw new Error('le navigateur n’a pas pu joindre Grist pour envoyer le fichier (erreur réseau ou accès refusé par le serveur).'); });
    }).then(function (r) {
      if (!r.ok) throw new Error('Grist a refusé le fichier (réponse HTTP ' + r.status + ').');
      return r.json();
    }).then(function (ids) {
      if (!Array.isArray(ids) || typeof ids[0] !== 'number') throw new Error('réponse inattendue de Grist.');
      return ids[0];
    });
  }

  global.Photos = { reduire: reduire, preparerDocument: preparerDocument, infosDocument: infosDocument, televerser: televerser, deplacer: deplacer, retirer: retirer, formatsAcceptes: formatsAcceptes, formatsDocuments: formatsDocuments };
})(window);
