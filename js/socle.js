/*
 * Socle de données du widget « Projets »
 * ---------------------------------------
 * Lit la table Grist, nettoie les valeurs et fournit la recherche, le filtre et
 * l’accès aux pièces jointes. Aucune dépendance autre que l’API officielle de Grist
 * (grist-plugin-api.js), chargée par la page avant ce fichier.
 *
 * Utilisation (page HTML) :
 *   Socle.demarrer({
 *     onProjets: function (projets, info) { ... },   // appelé à chaque changement des données
 *     onMappage: function (manquantes) { ... }       // colonnes obligatoires non associées
 *   });
 */
(function (global) {
  'use strict';

  // Colonnes attendues. « name » est l’identifiant utilisé dans le code ;
  // Grist demande à la personne qui configure le widget de les associer aux colonnes de la table.
  var COLONNES = [
    { name: 'Titre',       title: 'Titre',                       type: 'Text' },
    { name: 'Description', title: 'Description',                 type: 'Text' },
    { name: 'Balise',      title: 'Balise',                      type: 'Choice,ChoiceList', optional: true },
    { name: 'DateAjout',   title: 'Date d’ajout',                type: 'Date,DateTime',     optional: true },
    { name: 'Photos',      title: 'Photos',                      type: 'Attachments',       optional: true },
    { name: 'Couverture',  title: 'Couverture (image allégée)',  type: 'Attachments',       optional: true },
    { name: 'Videos',      title: 'Vidéos (une adresse par ligne)', type: 'Text',           optional: true },
    { name: 'Transcription', title: 'Transcription des vidéos (texte)', type: 'Text',        optional: true }
  ];

  // ---------- outils sur le texte ----------

  // Minuscules, sans accents ni ligatures : « Hébergé », « hebergé » et « HEBERGE » donnent la même chaîne.
  function normaliser(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
      .replace(/[’‘`]/g, "'")
      .toLowerCase();
  }

  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- lecture des valeurs de cellules ----------

  // Cellule masquée par une règle d’accès (ACL) : Grist la remplace par une valeur « censurée ».
  function estCensure(v) {
    if (Array.isArray(v)) return v.length === 1 && v[0] === 'C';
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      var nom = (v.constructor && v.constructor.name) || '';
      return /censor/i.test(nom);
    }
    return false;
  }

  function texte(v) {
    return (v == null || estCensure(v)) ? '' : String(v);
  }

  // Choix unique (texte), choix multiple (liste), pièces jointes (liste de numéros) : toujours un tableau.
  function liste(v) {
    if (v == null || estCensure(v)) return [];
    if (Array.isArray(v)) {
      if (v[0] === 'L') v = v.slice(1);            // encodage brut de Grist : ['L', a, b]
      return v.filter(function (x) { return x != null && x !== ''; });
    }
    if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
    return [v];
  }

  function pieces(v) {
    return liste(v).map(Number).filter(function (n) { return isFinite(n); });
  }

  // Grist stocke les dates en secondes depuis 1970.
  function versDate(v) {
    if (v == null || estCensure(v)) return null;
    if (Array.isArray(v) && (v[0] === 'D' || v[0] === 'd')) v = v[1];
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') return new Date(v * 1000);
    if (typeof v === 'string') { var d = new Date(v); return isNaN(d) ? null : d; }
    return null;
  }

  function formaterDate(d) {
    if (!d) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  }

  // ---------- vidéos hébergées à l’extérieur ----------
  // On ne fait qu’analyser l’adresse : aucun appel réseau tant que la personne n’a pas cliqué sur « Lancer la vidéo ».
  function analyserVideos(valeur) {
    return texte(valeur).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (brut) {
      var u;
      try { u = new URL(brut); } catch (e) { return { url: brut, type: 'invalide' }; }
      if (!/^https?:$/.test(u.protocol)) return { url: brut, type: 'invalide' };
      var h = u.hostname.replace(/^www\./, ''), id = null, m;
      if (h === 'youtu.be') id = u.pathname.slice(1);
      else if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
        id = u.searchParams.get('v') || ((m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)) && m[1]);
      }
      if (id) return { url: brut, type: 'youtube', embed: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) };
      if (h === 'vimeo.com' && (m = u.pathname.match(/^\/(\d+)/))) return { url: brut, type: 'vimeo', embed: 'https://player.vimeo.com/video/' + m[1] + '?dnt=1' };
      if ((m = u.pathname.match(/^\/(?:w|videos\/watch)\/([\w-]+)/))) return { url: brut, type: 'peertube', embed: u.origin + '/videos/embed/' + m[1] };
      if (/\.(mp4|webm|ogv)$/i.test(u.pathname)) return { url: brut, type: 'direct', embed: brut };
      return { url: brut, type: 'lien' };
    });
  }

  // ---------- projets ----------

  function construire(lignes) {
    return lignes.map(function (r) {
      var champs = ['Titre', 'Description', 'Balise', 'DateAjout', 'Photos', 'Couverture', 'Videos', 'Transcription'];
      var censures = champs.filter(function (k) { return estCensure(r[k]); }).length;
      var titre = texte(r.Titre), description = texte(r.Description);
      var date = versDate(r.DateAjout);
      return {
        id: r.id,
        titre: titre,
        description: description,
        balises: liste(r.Balise).map(String),
        date: date,
        photos: pieces(r.Photos),
        couverture: pieces(r.Couverture),
        videos: analyserVideos(r.Videos),
        transcription: texte(r.Transcription),
        censures: censures,
        recherche: normaliser(titre + ' ' + description)   // calculé une seule fois
      };
    });
  }

  // Du plus récent au plus ancien ; les projets sans date à la fin.
  function trierParDate(projets) {
    return projets.slice().sort(function (a, b) {
      var ta = a.date ? a.date.getTime() : -Infinity, tb = b.date ? b.date.getTime() : -Infinity;
      if (ta !== tb) return tb - ta;
      return b.id - a.id;
    });
  }

  // Chaque mot saisi doit se trouver dans le titre ou la description, dans n’importe quel ordre ;
  // la balise choisie (si elle l’est) se cumule avec la recherche.
  function filtrer(projets, criteres, dejaTrie) {
    criteres = criteres || {};
    var mots = normaliser(criteres.texte || '').split(/\s+/).filter(Boolean);
    return (dejaTrie ? projets : trierParDate(projets)).filter(function (p) {
      if (criteres.balise && p.balises.indexOf(criteres.balise) === -1) return false;
      return mots.every(function (m) { return p.recherche.indexOf(m) !== -1; });
    });
  }

  function listeBalises(projets) {
    var vues = {};
    projets.forEach(function (p) { p.balises.forEach(function (b) { vues[b] = (vues[b] || 0) + 1; }); });
    return Object.keys(vues).sort(function (a, b) { return a.localeCompare(b, 'fr'); })
      .map(function (b) { return { nom: b, effectif: vues[b] }; });
  }

  // ---------- accès aux pièces jointes ----------
  // Grist délivre un jeton temporaire en lecture seule ; on le renouvelle avant son expiration.
  function AccesPieces() { this.jeton = null; this.base = null; this.validite = 0; this.expire = 0; this._attente = null; }

  AccesPieces.prototype.obtenir = function () {
    var self = this;
    if (self.jeton && Date.now() < self.expire - 30000) return Promise.resolve(self);
    if (!self._attente) {
      self._attente = global.grist.docApi.getAccessToken({ readOnly: true }).then(function (r) {
        self.jeton = r.token;
        self.base = String(r.baseUrl).replace(/\/$/, '');
        self.validite = r.ttlMsecs || 0;
        self.expire = Date.now() + self.validite;
        self._attente = null;
        return self;
      }, function (e) { self._attente = null; throw e; });
    }
    return self._attente;
  };
  AccesPieces.prototype.url = function (id) { return this.base + '/attachments/' + id + '/download?auth=' + encodeURIComponent(this.jeton); };
  AccesPieces.prototype.urlMeta = function (id) { return this.base + '/attachments/' + id + '?auth=' + encodeURIComponent(this.jeton); };

  // ---------- connexion à Grist ----------

  // Bas niveau : lignes avec les noms de colonnes du widget (Titre, Description…).
  function ecouter(opts) {
    opts = opts || {};
    var grist = global.grist;
    grist.ready({ requiredAccess: opts.acces || 'read table', columns: opts.colonnes || COLONNES });
    grist.onRecords(function (records, mappings) {
      var lignes = grist.mapColumnNames(records);
      if (!lignes) { if (opts.onMappage) opts.onMappage((opts.colonnes || COLONNES).filter(function (c) { return !c.optional; })); return; }
      if (opts.onLignes) opts.onLignes(lignes, records, mappings);
    });
  }

  // Haut niveau : projets prêts à afficher.
  function demarrer(opts) {
    opts = opts || {};
    ecouter({
      acces: opts.acces,
      colonnes: opts.colonnes,
      onMappage: opts.onMappage,
      onLignes: function (lignes, brut, mappages) { if (opts.onProjets) opts.onProjets(construire(lignes), { brut: brut, mappages: mappages }); }
    });
  }

  global.Socle = {
    COLONNES: COLONNES,
    normaliser: normaliser, echapper: echapper,
    estCensure: estCensure, texte: texte, liste: liste, pieces: pieces, versDate: versDate, formaterDate: formaterDate,
    analyserVideos: analyserVideos,
    construire: construire, trierParDate: trierParDate, filtrer: filtrer, listeBalises: listeBalises,
    AccesPieces: AccesPieces,
    ecouter: ecouter, demarrer: demarrer
  };
})(window);
