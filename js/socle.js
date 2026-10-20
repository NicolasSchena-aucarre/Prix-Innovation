/*
 * Socle de données du widget « Projets »
 * ---------------------------------------
 * Lit la table Grist, nettoie les valeurs et fournit la recherche, le filtre et l’accès aux pièces jointes.
 * Les réglages se trouvent dans js/config.js (chargé avant ce fichier). Aucune dépendance autre que l’API
 * officielle de Grist (grist-plugin-api.js), chargée par la page.
 *
 * Utilisation (page HTML) :
 *   Socle.demarrer({
 *     onProjets: function (projets, info) { ... },   // appelé à chaque changement des données
 *     onMappage: function (manquantes) { ... }       // colonnes obligatoires introuvables
 *   });
 */
(function (global) {
  'use strict';

  // ---------- réglages (js/config.js) ----------

  var cfgControlee = null;
  function config() {
    var c = global.CONFIG_PROJETS;
    if (!c) throw new Error('Réglages introuvables : js/config.js doit être chargé avant js/socle.js.');
    if (cfgControlee !== c) { controler(c); cfgControlee = c; }
    return c;
  }
  function controler(c) {
    var pb = [];
    if (['full', 'read table'].indexOf(c.acces) === -1) pb.push('acces doit valoir « full » ou « read table »');
    if (!(c.parPage >= 1) || c.parPage % 1) pb.push('parPage doit être un entier supérieur ou égal à 1');
    if (!Array.isArray(c.hotesSansClic)) pb.push('hotesSansClic doit être une liste');
    if (!c.colonnes || typeof c.colonnes !== 'object') pb.push('colonnes doit être un objet');
    if (typeof c.langue !== 'string' || !c.langue) pb.push('langue doit être un texte, par exemple fr-FR');
    if (typeof c.fuseauHoraire !== 'string' || !c.fuseauHoraire) pb.push('fuseauHoraire doit être un texte, par exemple Europe/Paris');
    ['youtube', 'vimeo', 'peertube'].forEach(function (k) { if (!c.lecteurs || typeof c.lecteurs[k] !== 'string' || c.lecteurs[k].indexOf('{id}') === -1) pb.push('lecteurs.' + k + ' doit être une adresse contenant {id}'); });
    ['delaiSaisieMs', 'margeImagesPx', 'margeJetonMs', 'seuilBalayagePx'].forEach(function (k) { if (!(c[k] >= 0)) pb.push(k + ' doit être un nombre positif ou nul'); });
    if (pb.length) throw new Error('Réglages invalides dans js/config.js : ' + pb.join(' ; ') + '.');
  }

  // Rôles des colonnes attendues par le widget : c'est le contrat avec le code, il ne se règle pas.
  // Le nom de la colonne correspondante dans Grist se règle dans config.js (colonnes).
  var SCHEMA = [
    { name: 'Titre',         title: 'Titre',                          type: 'Text' },
    { name: 'Description',   title: 'Description',                    type: 'Text' },
    { name: 'Balise',        title: 'Balise',                         type: 'Choice,ChoiceList', optional: true },
    { name: 'DateAjout',     title: 'Date d’ajout',                   type: 'Date,DateTime',     optional: true },
    { name: 'Photos',        title: 'Photos',                         type: 'Attachments',       optional: true },
    { name: 'Couverture',    title: 'Couverture (image allégée)',     type: 'Attachments',       optional: true },
    { name: 'Videos',        title: 'Vidéos (une adresse par ligne)', type: 'Text',              optional: true },
    { name: 'Transcription', title: 'Transcription des vidéos (texte)', type: 'Text',            optional: true }
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
    return d.toLocaleDateString(config().langue, { day: 'numeric', month: 'long', year: 'numeric', timeZone: config().fuseauHoraire });
  }

  // ---------- vidéos hébergées à l’extérieur ----------
  // On ne fait qu’analyser l’adresse : aucun appel réseau tant que la personne n’a pas cliqué sur « Lancer la vidéo ».
  function lecteur(type, vars) {
    return config().lecteurs[type].replace('{id}', encodeURIComponent(vars.id)).replace('{origine}', vars.origine || '');
  }
  function analyserVideos(valeur) {
    return texte(valeur).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (brut) {
      var u;
      try { u = new URL(brut); } catch { return { url: brut, type: 'invalide' }; }
      if (!/^https?:$/.test(u.protocol)) return { url: brut, type: 'invalide' };
      var h = u.hostname.replace(/^www\./, ''), id = null, m;
      if (h === 'youtu.be') id = u.pathname.slice(1);
      else if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
        id = u.searchParams.get('v') || ((m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)) && m[1]);
      }
      if (id) return { url: brut, type: 'youtube', embed: lecteur('youtube', { id: id }) };
      if (h === 'vimeo.com' && (m = u.pathname.match(/^\/(\d+)/))) return { url: brut, type: 'vimeo', embed: lecteur('vimeo', { id: m[1] }) };
      if ((m = u.pathname.match(/^\/(?:w|videos\/watch)\/([\w-]+)/))) return { url: brut, type: 'peertube', embed: lecteur('peertube', { id: m[1], origine: u.origin }) };
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
    if (self.jeton && Date.now() < self.expire - config().margeJetonMs) return Promise.resolve(self);
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

  function cle(s) { return normaliser(s).replace(/[^a-z0-9]/g, ''); }

  // Pour chaque rôle : l'association faite à la main dans Grist l'emporte ; à défaut, on cherche dans la table la
  // colonne portant le nom prévu dans config.js (sans tenir compte des accents, de la casse, des espaces ni des tirets bas).
  function associer(records, mappings, roles) {
    var cles = records.length ? Object.keys(records[0]).filter(function (k) { return k !== 'id'; }) : [];
    var noms = config().colonnes, cibles = {}, origines = {};
    roles.forEach(function (c) {
      var m = mappings && mappings[c.name];
      if (m) { cibles[c.name] = Array.isArray(m) ? m[0] : m; origines[c.name] = 'manuelle'; return; }
      var voulu = cle(noms[c.name] || c.name), trouve = null;
      cles.some(function (k) { if (cle(k) === voulu) { trouve = k; return true; } return false; });
      cibles[c.name] = trouve; origines[c.name] = trouve ? 'automatique' : null;
    });
    return { cibles: cibles, origines: origines };
  }

  function convertir(records, cibles, roles) {
    return records.map(function (r) {
      var o = { id: r.id };
      roles.forEach(function (c) { var k = cibles[c.name]; o[c.name] = k ? r[k] : undefined; });
      return o;
    });
  }

  // Bas niveau : lignes avec les rôles du widget (Titre, Description…).
  // Options : acces (par défaut celui de config.js), roles (liste de rôles à lire, par défaut tous),
  // requises (rôles obligatoires, par défaut ceux du schéma), onLignes, onMappage.
  // Avec l'accès complet, Grist fournit toutes les colonnes de la table (sans que la personne qui configure le widget
  // n'ait à les afficher ni à les associer) ; avec un accès moindre, seules les colonnes associées à la main sont fournies.
  function ecouter(opts) {
    opts = opts || {};
    var grist = global.grist, acces = opts.acces || config().acces;
    var roles = opts.roles ? SCHEMA.filter(function (c) { return opts.roles.indexOf(c.name) !== -1; }) : SCHEMA;
    var requises = opts.requises || roles.filter(function (c) { return !c.optional; }).map(function (c) { return c.name; });
    grist.ready({
      requiredAccess: acces,
      // Toutes les colonnes sont déclarées facultatives pour que Grist n'exige aucune association : le contrôle
      // des colonnes obligatoires est fait ici, après l'association automatique.
      columns: roles.map(function (c) { var d = {}; Object.keys(c).forEach(function (k) { d[k] = c[k]; }); d.optional = true; return d; })
    });
    grist.onRecords(function (records, mappings) {
      var assoc = associer(records, mappings, roles);
      var manquantes = records.length ? roles.filter(function (c) { return requises.indexOf(c.name) !== -1 && !assoc.cibles[c.name]; }) : [];
      if (manquantes.length) { if (opts.onMappage) opts.onMappage(manquantes); return; }
      if (opts.onLignes) opts.onLignes(convertir(records, assoc.cibles, roles), records, assoc.cibles, assoc.origines);
    }, acces === 'full' ? { includeColumns: 'normal' } : undefined);
  }

  // Haut niveau : projets prêts à afficher.
  function demarrer(opts) {
    opts = opts || {};
    ecouter({
      acces: opts.acces,
      onMappage: opts.onMappage,
      onLignes: function (lignes, brut, mappages, origines) { if (opts.onProjets) opts.onProjets(construire(lignes), { brut: brut, mappages: mappages, origines: origines }); }
    });
  }

  // Interface publique : uniquement ce qu'utilisent le widget et les pages de diagnostic.
  global.Socle = {
    config: config, SCHEMA: SCHEMA,
    echapper: echapper, pieces: pieces, formaterDate: formaterDate,
    trierParDate: trierParDate, filtrer: filtrer, listeBalises: listeBalises,
    AccesPieces: AccesPieces,
    ecouter: ecouter, demarrer: demarrer
  };
})(window);
