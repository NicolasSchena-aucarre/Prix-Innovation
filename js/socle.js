/*
 * Socle de données du widget « Projets »
 * ---------------------------------------
 * Lit la table Grist rattachée au widget et en déduit seul le rôle de chaque colonne, d'après son type, son libellé
 * et son ordre : aucun nom de colonne n'est écrit à l'avance, et la personne qui configure le widget n'a rien à associer.
 * Fournit aussi la recherche, le filtre et l'accès aux pièces jointes.
 * Les réglages se trouvent dans js/config.js (chargé avant ce fichier). Aucune dépendance autre que l'API
 * officielle de Grist (grist-plugin-api.js), chargée par la page.
 *
 * Utilisation (page HTML) :
 *   Socle.demarrer({
 *     onProjets: function (projets, info) { ... },   // appelé à chaque changement des données
 *     onErreur: function (message) { ... }           // structure de la table inexploitable
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
    if (typeof c.langue !== 'string' || !c.langue) pb.push('langue doit être un texte, par exemple fr-FR');
    if (typeof c.fuseauHoraire !== 'string' || !c.fuseauHoraire) pb.push('fuseauHoraire doit être un texte, par exemple Europe/Paris');
    ['youtube', 'vimeo', 'peertube'].forEach(function (k) { if (!c.lecteurs || typeof c.lecteurs[k] !== 'string' || c.lecteurs[k].indexOf('{id}') === -1) pb.push('lecteurs.' + k + ' doit être une adresse contenant {id}'); });
    ['delaiSaisieMs', 'margeImagesPx', 'margeJetonMs', 'seuilBalayagePx'].forEach(function (k) { if (!(c[k] >= 0)) pb.push(k + ' doit être un nombre positif ou nul'); });
    if (pb.length) throw new Error('Réglages invalides dans js/config.js : ' + pb.join(' ; ') + '.');
  }

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

  function estDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

  // Cellule masquée par une règle d’accès (ACL) : Grist la remplace par une valeur « censurée ».
  function estCensure(v) {
    if (Array.isArray(v)) return v.length === 1 && v[0] === 'C';
    if (v && typeof v === 'object' && !estDate(v)) {
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
    if (estDate(v)) return isNaN(v) ? null : v;
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

  // ---------- structure de la table ----------
  // Le widget lit les colonnes de la table rattachée, avec leur type, leur libellé et leur ordre :
  //   1. par les tables de métadonnées de Grist (_grist_Tables et _grist_Tables_column) ;
  //   2. à défaut, par l'interface web de Grist (avec le jeton d'accès) ;
  //   3. à défaut, en déduisant la nature de chaque colonne de la forme de ses valeurs (sans libellés).
  // Puis il attribue un rôle à chaque colonne d'après son type, sans jamais regarder son nom :
  //   pièces jointes → galerie ; première date → date et tri ; premier choix → balises et filtre ;
  //   texte dont les valeurs sont des adresses de vidéos → vidéos ; première puis deuxième colonne de texte
  //   renseignée → titre puis description ; toute autre colonne → champ affiché dans le détail, avec son libellé.

  function baseType(t) { return String(t || '').split(':')[0]; }
  var TYPES_AFFICHABLES = ['Text', 'Int', 'Numeric', 'Bool', 'Date', 'DateTime', 'Choice', 'ChoiceList', 'Attachments'];

  // Pourquoi une colonne est-elle écartée ? (null = elle est retenue)
  function raisonEcartee(c) {
    if (c.id === 'id' || c.id === 'manualSort' || /^gristHelper_/.test(c.id)) return 'colonne technique';
    if (c.formule) return 'colonne-formule ou colonne vide';
    if (TYPES_AFFICHABLES.indexOf(baseType(c.type)) === -1) return 'type non affichable (' + baseType(c.type) + ')';
    return null;
  }

  // Un résultat de fetchTable est organisé par colonnes : on le transforme en lignes.
  function lignesDe(t) {
    var ks = Object.keys(t || {}), n = ks.length ? t[ks[0]].length : 0, out = [], i;
    for (i = 0; i < n; i++) { var o = {}; ks.forEach(function (k) { o[k] = t[k][i]; }); out.push(o); }
    return out;
  }

  function structureMeta(idTable, cles) {
    var grist = global.grist;
    return grist.docApi.fetchTable('_grist_Tables').then(function (t1) {
      return grist.docApi.fetchTable('_grist_Tables_column').then(function (t2) {
        var tabs = lignesDe(t1), cols = lignesDe(t2), table = null;
        if (idTable) table = tabs.filter(function (t) { return t.tableId === idTable; })[0];
        else {
          // Sans identifiant : la table qui contient toutes les colonnes reçues (la plus étroite s'il y en a plusieurs).
          var cand = tabs.filter(function (t) {
            var ids = cols.filter(function (c) { return c.parentId === t.id; }).map(function (c) { return c.colId; });
            return cles.every(function (k) { return ids.indexOf(k) !== -1; });
          }).sort(function (a, b) {
            return cols.filter(function (c) { return c.parentId === a.id; }).length - cols.filter(function (c) { return c.parentId === b.id; }).length;
          });
          table = cand[0];
        }
        if (!table) throw new Error('table introuvable dans les métadonnées');
        return { table: table.tableId, colonnes: cols.filter(function (c) { return c.parentId === table.id; })
          .sort(function (a, b) { return a.parentPos - b.parentPos; })
          .map(function (c) { return { id: c.colId, label: c.label || c.colId, type: c.type, formule: !!c.isFormula }; }) };
      });
    });
  }

  function structureWeb(idTable, acces) {
    if (!idTable) return Promise.reject(new Error('identifiant de table inconnu'));
    return acces.obtenir().then(function () {
      return fetch(acces.base + '/tables/' + encodeURIComponent(idTable) + '/columns?auth=' + encodeURIComponent(acces.jeton));
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      return { table: idTable, colonnes: (j.columns || []).map(function (c) {
        var f = c.fields || {};
        return { id: c.id, label: f.label || c.id, type: f.type, formule: !!f.isFormula };
      }) };
    });
  }

  // Dernier recours : la nature d'une colonne se déduit de la forme de ses valeurs ; le libellé est l'identifiant.
  function structureValeurs(records, cles) {
    return cles.map(function (k) {
      var valeurs = records.map(function (r) { return r[k]; }).filter(function (v) { return v != null && v !== ''; }), ex = valeurs[0], type = 'Text';
      if (estDate(ex)) type = 'Date';
      else if (Array.isArray(ex)) type = typeof ex[0] === 'number' ? 'Attachments' : 'ChoiceList';
      else if (typeof ex === 'boolean') type = 'Bool';
      else if (typeof ex === 'number') type = 'Numeric';
      else if (typeof ex === 'string' && valeurs.length >= 4) {
        // Un texte court dont certaines valeurs se répètent est pris pour un choix ; un titre (toutes valeurs
        // différentes) ou un texte long ne l'est pas.
        var distinctes = {}; valeurs.forEach(function (v) { distinctes[v] = true; });
        var nb = Object.keys(distinctes).length, moy = valeurs.reduce(function (n, v) { return n + String(v).length; }, 0) / valeurs.length;
        if (nb <= 30 && nb < valeurs.length && moy <= 30) type = 'Choice';
      }
      return { id: k, label: k, type: type, formule: false };
    });
  }

  function resoudreStructure(records, cles, acces) {
    var grist = global.grist;
    var idDeTable = new Promise(function (ok) {
      try { Promise.resolve(grist.selectedTable.getTableId()).then(ok, function () { ok(null); }); } catch { ok(null); }
    });
    return idDeTable.then(function (idTable) {
      return structureMeta(idTable, cles).then(function (r) { r.source = 'metadonnees'; return r; })
        .catch(function () { return structureWeb(idTable, acces).then(function (r) { r.source = 'web'; return r; }); })
        .catch(function () { return { table: idTable, source: 'valeurs', colonnes: structureValeurs(records, cles) }; });
    }).then(function (r) {
      // Colonnes reçues mais inconnues des métadonnées : complétées par la forme de leurs valeurs.
      var connus = r.colonnes.map(function (c) { return c.id; });
      var inconnues = cles.filter(function (k) { return connus.indexOf(k) === -1; });
      if (inconnues.length) r.colonnes = r.colonnes.concat(structureValeurs(records, inconnues));
      return r;
    });
  }

  // Une colonne de texte est une colonne de vidéos si au moins la moitié de ses lignes sont des adresses web et si
  // l'une d'elles est celle d'une vidéo reconnue (un simple « site web » n'en est pas une). Cette tolérance évite
  // qu'une faute de saisie dans une seule cellule fasse perdre toute la colonne.
  function estColonneVideos(c, records) {
    var lignes = [];
    records.forEach(function (r) { texte(r[c.id]).split(/\r?\n/).forEach(function (l) { if (l.trim()) lignes.push(l.trim()); }); });
    if (!lignes.length) return false;
    var adresses = lignes.filter(function (l) { return /^https?:\/\//i.test(l); });
    return adresses.length >= lignes.length / 2 &&
      adresses.some(function (l) { return ['youtube', 'vimeo', 'peertube', 'direct'].indexOf(analyserVideos(l)[0].type) !== -1; });
  }

  // Attribue un rôle à chaque colonne retenue (voir le principe en tête de section).
  function deduireRoles(structure, cles, records) {
    var utiles = structure.colonnes.filter(function (c) { return cles.indexOf(c.id) !== -1 && !raisonEcartee(c); });
    var roles = { titre: null, description: null, date: null, balise: null, medias: [], videos: [], champs: [] }, pris = {};
    var textes = utiles.filter(function (c) { return baseType(c.type) === 'Text'; });
    textes.forEach(function (c) { if (estColonneVideos(c, records)) { roles.videos.push(c); pris[c.id] = true; } });
    textes.filter(function (c) {
      return !pris[c.id] && records.some(function (r) { return texte(r[c.id]).trim() !== ''; });
    }).slice(0, 2).forEach(function (c, i) { if (i === 0) roles.titre = c; else roles.description = c; pris[c.id] = true; });
    utiles.forEach(function (c) {
      var b = baseType(c.type);
      if (pris[c.id]) return;
      if (b === 'Attachments') { roles.medias.push(c); pris[c.id] = true; }
      else if ((b === 'Date' || b === 'DateTime') && !roles.date) { roles.date = c; pris[c.id] = true; }
      else if ((b === 'Choice' || b === 'ChoiceList') && !roles.balise) { roles.balise = c; pris[c.id] = true; }
    });
    roles.champs = utiles.filter(function (c) { return !pris[c.id]; });
    return roles;
  }

  // Description lisible de la structure (pour la page de vérification) : rôle de chaque colonne.
  function decrire(structure, roles, cles) {
    function role(c) {
      var raison = raisonEcartee(c);
      if (raison) return { role: 'ignorée', raison: raison };
      if (cles.indexOf(c.id) === -1) return { role: 'ignorée', raison: 'non fournie par Grist (colonne non affichée dans le panneau du widget)' };
      if (roles.titre && roles.titre.id === c.id) return { role: 'titre' };
      if (roles.description && roles.description.id === c.id) return { role: 'description' };
      if (roles.date && roles.date.id === c.id) return { role: 'date' };
      if (roles.balise && roles.balise.id === c.id) return { role: 'balises' };
      if (roles.medias.some(function (m) { return m.id === c.id; })) return { role: 'photos' };
      if (roles.videos.some(function (m) { return m.id === c.id; })) return { role: 'vidéos' };
      return { role: 'champ du détail' };
    }
    return { table: structure.table, source: structure.source, roles: roles,
      colonnes: structure.colonnes.map(function (c) { var r = role(c); return { id: c.id, label: c.label, type: c.type, role: r.role, raison: r.raison || '' }; }) };
  }

  // ---------- projets ----------

  function formaterChamp(v, c) {
    if (v == null || estCensure(v)) return '';
    switch (baseType(c.type)) {
      case 'Bool': return v ? 'Oui' : 'Non';
      case 'Int': case 'Numeric': return isFinite(v) ? Number(v).toLocaleString(config().langue) : String(v);
      case 'Date': case 'DateTime': return formaterDate(versDate(v));
      case 'ChoiceList': return liste(v).join(', ');
      default: return texte(v).trim();
    }
  }

  function construire(records, roles) {
    var utilisees = [].concat(roles.titre || [], roles.description || [], roles.date || [], roles.balise || [], roles.medias, roles.videos, roles.champs);
    return records.map(function (r) {
      var censures = utilisees.filter(function (c) { return estCensure(r[c.id]); }).length;
      var titre = roles.titre ? texte(r[roles.titre.id]) : '', description = roles.description ? texte(r[roles.description.id]) : '';
      var photos = [], videos = [], champs = [];
      roles.medias.forEach(function (c) { photos = photos.concat(pieces(r[c.id])); });
      roles.videos.forEach(function (c) { videos = videos.concat(analyserVideos(r[c.id])); });
      roles.champs.forEach(function (c) { var v = formaterChamp(r[c.id], c); if (v) champs.push({ label: c.label, valeur: v }); });
      return {
        id: r.id,
        titre: titre,
        description: description,
        balises: roles.balise ? liste(r[roles.balise.id]).map(String) : [],
        date: roles.date ? versDate(r[roles.date.id]) : null,
        photos: photos,
        videos: videos,
        champs: champs,
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
  // getAccessToken renvoie une adresse construite avec l'identifiant COURT du document, alors que le jeton encode
  // l'identifiant canonique que le serveur vérifie. On remplace l'un par l'autre quand ils diffèrent ; sans effet
  // (adresse inchangée) quand il n'y a pas de décalage.
  function docIdDuJeton(token) {
    try {
      var b = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var p = JSON.parse(atob(b));
      return p && p.docId ? p.docId : null;
    } catch { return null; }
  }
  function baseApi(info) {
    var id = docIdDuJeton(info.token), m = String(info.baseUrl).match(/^(.*\/api\/docs\/)([^/?]+)\/?$/);
    if (m && id && m[2] !== id) return m[1] + id;
    return String(info.baseUrl).replace(/\/$/, '');
  }

  // Grist délivre un jeton temporaire en lecture seule ; on le renouvelle avant son expiration.
  function AccesPieces() { this.jeton = null; this.base = null; this.validite = 0; this.expire = 0; this._attente = null; }

  AccesPieces.prototype.obtenir = function () {
    var self = this;
    if (self.jeton && Date.now() < self.expire - config().margeJetonMs) return Promise.resolve(self);
    if (!self._attente) {
      self._attente = global.grist.docApi.getAccessToken({ readOnly: true }).then(function (r) {
        self.jeton = r.token;
        self.base = baseApi(r);
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
  // Aucune colonne n'est déclarée à Grist : le panneau du widget n'affiche donc aucune association à faire.
  // Avec l'accès complet, Grist fournit toutes les colonnes de la table (includeColumns: normal).
  // Options : acces (par défaut celui de config.js), onProjets (projets, info), onErreur (message).
  // info.structure décrit la table (identifiant, source de la lecture, rôle de chaque colonne).
  function demarrer(opts) {
    opts = opts || {};
    var grist = global.grist, acces = opts.acces || config().acces, jetons = new AccesPieces();
    var cache = { signature: null, structure: null }, file = Promise.resolve();

    function traiter(records) {
      if (!records.length) { if (opts.onProjets) opts.onProjets([], { structure: null, brut: records }); return null; }
      var cles = Object.keys(records[0]).filter(function (k) { return k !== 'id'; }), signature = cles.join('\u0001');
      var pret = cache.signature === signature ? Promise.resolve(cache.structure)
        : resoudreStructure(records, cles, jetons).then(function (st) { cache = { signature: signature, structure: st }; return st; });
      return pret.then(function (st) {
        var roles = deduireRoles(st, cles, records);
        if (!roles.titre) throw new Error('Aucune colonne de texte renseignée : le widget ne peut pas déterminer le titre des projets.');
        if (opts.onProjets) opts.onProjets(construire(records, roles), { structure: decrire(st, roles, cles), brut: records });
      });
    }

    grist.ready({ requiredAccess: acces });
    grist.onRecords(function (records) {
      // Les changements de données sont traités l'un après l'autre, dans l'ordre où ils arrivent.
      file = file.then(function () { return traiter(records); }).catch(function (e) { if (opts.onErreur) opts.onErreur(e && e.message ? e.message : String(e)); });
    }, acces === 'full' ? { includeColumns: 'normal' } : undefined);
  }

  // Interface publique : uniquement ce qu'utilisent le widget et les pages de diagnostic.
  global.Socle = {
    config: config, echapper: echapper, formaterDate: formaterDate,
    trierParDate: trierParDate, filtrer: filtrer, listeBalises: listeBalises,
    AccesPieces: AccesPieces, demarrer: demarrer
  };
})(window);
