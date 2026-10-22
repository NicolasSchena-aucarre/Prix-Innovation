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
 *
 * Le widget de gestion (js/gestion.js) n'est pas rattaché à la table des projets : il la désigne par son nom
 * (réglage gestion.table) et la lit avec Socle.lireTable(), qui renvoie la structure, les rôles et les lignes brutes,
 * y compris pour une table vide.
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
    var col = c.colonnes;
    if (!col || typeof col !== 'object') pb.push('la section colonnes est absente');
    else {
      ['titre', 'sousTitre'].forEach(function (k) { if (typeof col[k] !== 'string' || !col[k].trim()) pb.push('colonnes.' + k + ' doit être le nom d’une colonne (obligatoire)'); });
      FONCTIONS.forEach(function (f) { if (!f.obligatoire && typeof col[f.cle] !== 'string') pb.push('colonnes.' + f.cle + ' doit être un nom de colonne, ou \'\' pour ne pas l’utiliser'); });
      if (!Array.isArray(col.autres) || col.autres.some(function (n) { return typeof n !== 'string' || !n.trim(); })) pb.push('colonnes.autres doit être une liste de noms de colonnes');
    }
    if (['recents', 'anciens', 'titre'].indexOf(c.tri) === -1) pb.push('tri doit valoir \'recents\', \'anciens\' ou \'titre\'');
    if (typeof c.separateursTags !== 'string') pb.push('separateursTags doit être un texte (les caractères qui séparent les tags), ou \'\'');
    if (!c.libelles || typeof c.libelles.tousLesThemes !== 'string' || !c.libelles.tousLesThemes.trim()) pb.push('libelles.tousLesThemes doit être un texte');
    if (pb.length) throw new Error('Réglages invalides dans js/config.js : ' + pb.join(' ; ') + '.');
  }

  // Réglages du widget de gestion (section « gestion » de config.js) ; le widget de lecture n'en dépend pas.
  var cfgGestionControlee = null;
  function configGestion() {
    var g = config().gestion;
    if (!g || typeof g !== 'object') throw new Error('Réglages introuvables : la section « gestion » manque dans js/config.js.');
    if (cfgGestionControlee === g) return g;
    var pb = [], p = g.photos;
    if (typeof g.table !== 'string' || !g.table.trim()) pb.push('gestion.table doit être le nom de la table des projets');
    if (typeof g.numero !== 'string') pb.push('gestion.numero doit être le nom de la colonne du numéro, ou \'\' pour ne pas l’afficher');
    ['titreObligatoire', 'sousTitreObligatoire', 'actualisationAuRetour'].forEach(function (k) {
      if (typeof g[k] !== 'boolean') pb.push('gestion.' + k + ' doit valoir true ou false');
    });
    var d = g.documents;
    if (!d || typeof d !== 'object') pb.push('gestion.documents doit être un groupe de réglages');
    else {
      if (!Array.isArray(d.formats) || !d.formats.length) pb.push('gestion.documents.formats doit être une liste non vide de types, par exemple application/pdf');
      if (!(d.poidsMaxMo > 0)) pb.push('gestion.documents.poidsMaxMo doit être un nombre supérieur à 0');
    }
    if (!p || typeof p !== 'object') pb.push('gestion.photos doit être un groupe de réglages');
    else {
      if (!Array.isArray(p.formats) || !p.formats.length) pb.push('gestion.photos.formats doit être une liste non vide de types, par exemple image/jpeg');
      if (!(p.poidsMaxSourceMo > 0)) pb.push('gestion.photos.poidsMaxSourceMo doit être un nombre supérieur à 0');
      if (!(p.largeurMaxPx >= 100)) pb.push('gestion.photos.largeurMaxPx doit être un nombre supérieur ou égal à 100');
      if (!(p.qualite > 0 && p.qualite <= 1)) pb.push('gestion.photos.qualite doit être un nombre supérieur à 0 et inférieur ou égal à 1');
      if (['image/jpeg', 'image/webp'].indexOf(p.formatSortie) === -1) pb.push('gestion.photos.formatSortie doit valoir image/jpeg ou image/webp');
    }
    if (pb.length) throw new Error('Réglages invalides dans js/config.js : ' + pb.join(' ; ') + '.');
    cfgGestionControlee = g;
    return g;
  }

  // ---------- fonctions des colonnes ----------
  // Chaque fonction se règle dans la section « colonnes » de js/config.js ; « types » : types de colonne Grist admis.
  var FONCTIONS = [
    { cle: 'titre', types: ['Text'], obligatoire: true },
    { cle: 'sousTitre', types: ['Text'], obligatoire: true },
    { cle: 'resume', types: ['Text'] },
    { cle: 'porteur', types: ['Text', 'Choice', 'ChoiceList'] },
    { cle: 'theme', types: ['ChoiceList'] },
    { cle: 'tags', types: ['Text'] },
    { cle: 'contact', types: ['Text'] },
    { cle: 'precisions', types: ['Attachments'] },
    { cle: 'illustration', types: ['Attachments'] },
    { cle: 'videos', types: ['Text'] }
  ];
  var TYPES_FR = { Text: 'Texte', Int: 'Entier', Numeric: 'Nombre', Bool: 'Oui/non', Date: 'Date', DateTime: 'Date et heure', Choice: 'Choix', ChoiceList: 'Choix multiple', Attachments: 'Pièces jointes' };

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

  // Les tags sont saisis dans une colonne de texte : un par ligne, ou séparés par un des caractères de « separateursTags »
  // (config.js). Espaces retirés, doublons écartés, ordre conservé.
  function separerTags(v) {
    var seps = String(config().separateursTags || '').replace(/[\]\\^-]/g, '\\$&'), re = new RegExp('[\\r\\n' + seps + ']+'), vus = {}, out = [];
    texte(v).split(re).forEach(function (t) { t = t.trim(); if (t && !vus[t]) { vus[t] = true; out.push(t); } });
    return out;
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
  // Puis il associe chaque fonction (titre, sous-titre, résumé, thème…) à la colonne dont le nom est déclaré dans la
  // section « colonnes » de js/config.js, et vérifie son type. Une colonne non déclarée n'est jamais utilisée.

  function baseType(t) { return String(t || '').split(':')[0]; }
  var TYPES_AFFICHABLES = ['Text', 'Int', 'Numeric', 'Bool', 'Date', 'DateTime', 'Choice', 'ChoiceList', 'Attachments'];

  // Pourquoi une colonne est-elle écartée ? (null = elle est retenue)
  function raisonEcartee(c) {
    if (c.id === 'id' || c.id === 'manualSort' || /^gristHelper_/.test(c.id)) return 'colonne technique';
    if (c.formule) return 'colonne-formule ou colonne vide';
    if (TYPES_AFFICHABLES.indexOf(baseType(c.type)) === -1) return 'type non affichable (' + baseType(c.type) + ')';
    return null;
  }

  // Valeurs proposées par une colonne de choix : elles sont déclarées dans ses options (JSON, clé « choices »).
  function choixDe(options) {
    var o = options;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return []; } }
    return o && Array.isArray(o.choices) ? o.choices.map(String) : [];
  }

  // Une colonne telle que la lit le socle. « declencheur » : colonne de données dotée d'une formule de déclenchement
  // (Grist la remplit lui-même, par exemple à la création de la ligne) : le widget de gestion ne l'écrit pas.
  function colonne(id, label, type, estFormule, formule, options) {
    return {
      id: id, label: label || id, type: type, formule: !!estFormule,
      declencheur: !estFormule && String(formule == null ? '' : formule).trim() !== '',
      choix: choixDe(options)
    };
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
          .map(function (c) { return colonne(c.colId, c.label, c.type, c.isFormula, c.formula, c.widgetOptions); }) };
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
        return colonne(c.id, f.label, f.type, f.isFormula, f.formula, f.widgetOptions);
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
      return colonne(k, k, type, false, '', null);
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

  // Structure d'une table désignée par son nom, sans avoir besoin de ses données (une table vide a une structure).
  // Métadonnées de Grist, à défaut interface web. Pas de dernier recours par les valeurs : sans données, il ne
  // saurait rien déduire, et une structure devinée ne doit pas servir à écrire.
  function structureDe(idTable, acces) {
    return structureMeta(idTable, []).then(function (r) { r.source = 'metadonnees'; return r; })
      .catch(function () { return structureWeb(idTable, acces).then(function (r) { r.source = 'web'; return r; }); });
  }

  // Clé de comparaison d'un nom de colonne : « Sous-titre », « sous_titre » et « SOUS TITRE » sont la même.
  function cleNom(n) { return normaliser(n).replace(/[^a-z0-9]+/g, ''); }

  function nomType(t) { var b = baseType(t); return TYPES_FR[b] || b; }

  // Associe chaque fonction à sa colonne. Renvoie les rôles : { titre, sousTitre, resume, porteur, theme, tags, contact,
  // precisions, illustration, date, videos : colonne ou null ; autres : liste de colonnes }.
  // Si une colonne déclarée est introuvable, d'un type qui ne convient pas ou déclarée deux fois, lève une erreur qui
  // les liste toutes, pour tout corriger en une fois.
  // « gestion » (vrai pour le widget de gestion seulement) : lie aussi la colonne du numéro du projet, lecture seule.
  function lierColonnes(structure, cles, gestion) {
    var cfg = config().colonnes, pb = [], roles = { autres: [] }, prises = {};
    var dispo = structure.colonnes.filter(function (c) { return c.id !== 'id' && c.id !== 'manualSort' && !/^gristHelper_/.test(c.id); });

    function chercher(nom, reglage, types, formuleAdmise) {
      var k = cleNom(nom), trouvees = dispo.filter(function (c) { return cleNom(c.label) === k || cleNom(c.id) === k; });
      if (!trouvees.length) { pb.push('la colonne « ' + nom + ' » (réglage ' + reglage + ') est introuvable'); return null; }
      if (trouvees.length > 1) { pb.push('plusieurs colonnes correspondent à « ' + nom + ' » (réglage ' + reglage + ') : ' + trouvees.map(function (c) { return '« ' + c.label + ' »'; }).join(', ')); return null; }
      var c = trouvees[0];
      if (cles.indexOf(c.id) === -1) { pb.push('la colonne « ' + c.label + ' » (réglage ' + reglage + ') n’est pas fournie par Grist'); return null; }
      if (c.formule && !formuleAdmise) { pb.push('la colonne « ' + c.label + ' » (réglage ' + reglage + ') est une colonne à formule ou une colonne vide : elle ne peut pas être utilisée'); return null; }
      if (types && types.indexOf(baseType(c.type)) === -1) {
        pb.push('la colonne « ' + c.label + ' » (réglage ' + reglage + ') doit être de type ' + types.map(function (t) { return TYPES_FR[t]; }).join(' ou ') + ' (elle est de type ' + nomType(c.type) + ')');
        return null;
      }
      if (TYPES_AFFICHABLES.indexOf(baseType(c.type)) === -1) { pb.push('la colonne « ' + c.label + ' » (réglage ' + reglage + ') est d’un type non pris en charge (' + nomType(c.type) + ')'); return null; }
      if (prises[c.id]) { pb.push('la colonne « ' + c.label + ' » est déclarée deux fois (réglages ' + prises[c.id] + ' et ' + reglage + ')'); return null; }
      prises[c.id] = reglage;
      return c;
    }

    FONCTIONS.forEach(function (f) {
      var nom = cfg[f.cle];
      roles[f.cle] = nom && nom.trim() ? chercher(nom, 'colonnes.' + f.cle, f.types) : null;
    });
    roles.numero = null;
    if (gestion) {
      var nomNumero = config().gestion.numero;
      if (nomNumero && nomNumero.trim()) roles.numero = chercher(nomNumero, 'gestion.numero', ['Text', 'Int', 'Numeric'], true);   // jamais écrite : une colonne à formule convient aussi
    }
    cfg.autres.forEach(function (nom, i) { var c = chercher(nom, 'colonnes.autres[' + i + ']', null); if (c) roles.autres.push(c); });

    if (pb.length) {
      throw new Error('Les colonnes déclarées dans la section « colonnes » de js/config.js ne correspondent pas à la table « ' + structure.table + ' » : ' +
        pb.join(' ; ') + '. Colonnes de la table : ' + dispo.map(function (c) { return c.label + ' (' + nomType(c.type) + ')'; }).join(', ') + '.');
    }
    return roles;
  }

  function colonnesUtilisees(roles) {
    return FONCTIONS.map(function (f) { return roles[f.cle]; }).filter(Boolean).concat(roles.autres, roles.numero || []);
  }

  // Description lisible de la structure (pour la page de vérification) : fonction de chaque colonne.
  function decrire(structure, roles, cles) {
    var NOMS = { titre: 'titre', sousTitre: 'sous-titre', resume: 'résumé', porteur: 'porteur', theme: 'thème', tags: 'tags', contact: 'contact', precisions: 'précisions', illustration: 'illustration', videos: 'vidéos' };
    function role(c) {
      var fonction = FONCTIONS.filter(function (f) { return roles[f.cle] && roles[f.cle].id === c.id; })[0];
      if (fonction) return { role: NOMS[fonction.cle] };
      if (roles.numero && roles.numero.id === c.id) return { role: 'numéro (gestion seulement)' };
      if (roles.autres.some(function (m) { return m.id === c.id; })) return { role: 'autre champ du détail' };
      var raison = raisonEcartee(c);
      if (raison) return { role: 'non utilisée', raison: raison };
      if (cles.indexOf(c.id) === -1) return { role: 'non utilisée', raison: 'non fournie par Grist' };
      return { role: 'non utilisée', raison: 'non déclarée dans js/config.js' };
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
    var utilisees = colonnesUtilisees(roles);
    function val(r, c) { return c ? texte(r[c.id]).trim() : ''; }
    return records.map(function (r) {
      var censures = utilisees.filter(function (c) { return estCensure(r[c.id]); }).length;
      var titre = val(r, roles.titre), sousTitre = val(r, roles.sousTitre), resume = val(r, roles.resume);
      var champs = [];
      roles.autres.forEach(function (c) { var v = formaterChamp(r[c.id], c); if (v) champs.push({ label: c.label, valeur: v }); });
      return {
        id: r.id,
        titre: titre,
        sousTitre: sousTitre,
        resume: resume,
        porteur: roles.porteur ? formaterChamp(r[roles.porteur.id], roles.porteur) : '',
        themes: roles.theme ? liste(r[roles.theme.id]).map(String) : [],
        tags: roles.tags ? separerTags(r[roles.tags.id]) : [],
        contact: roles.contact ? texte(r[roles.contact.id]).trim() : '',
        numero: roles.numero ? texte(r[roles.numero.id]).trim() : '',   // gestion seulement : le widget public ne le lit jamais
        precisions: roles.precisions ? pieces(r[roles.precisions.id]) : [],
        illustrations: roles.illustration ? pieces(r[roles.illustration.id]) : [],
        videos: roles.videos ? analyserVideos(r[roles.videos.id]) : [],
        champs: champs,
        censures: censures,
        recherche: normaliser(titre + ' ' + sousTitre + ' ' + resume)   // calculé une seule fois
      };
    });
  }

  // Classement des projets. 'recents' : le dernier créé en premier (numéro de ligne décroissant) ; 'anciens' : l'inverse ;
  // 'titre' : ordre alphabétique des titres (à la française, sans tenir compte de la casse ni des accents).
  function trierProjets(projets, mode) {
    var m = mode || 'recents';
    return projets.slice().sort(function (a, b) {
      if (m === 'titre') {
        var d = a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base', numeric: true });
        if (d) return d;
        return b.id - a.id;
      }
      return m === 'anciens' ? a.id - b.id : b.id - a.id;
    });
  }

  // Chaque mot saisi doit se trouver dans le titre, le sous-titre ou le résumé, dans n’importe quel ordre ;
  // le thème choisi (s’il l’est) se cumule avec la recherche.
  function filtrer(projets, criteres, dejaTrie) {
    criteres = criteres || {};
    var mots = normaliser(criteres.texte || '').split(/\s+/).filter(Boolean);
    return (dejaTrie ? projets : trierProjets(projets, config().tri)).filter(function (p) {
      if (criteres.theme && p.themes.indexOf(criteres.theme) === -1) return false;
      return mots.every(function (m) { return p.recherche.indexOf(m) !== -1; });
    });
  }

  function listeThemes(projets) {
    var vues = {};
    projets.forEach(function (p) { p.themes.forEach(function (t) { vues[t] = (vues[t] || 0) + 1; }); });
    return Object.keys(vues).sort(function (a, b) { return a.localeCompare(b, 'fr'); })
      .map(function (t) { return { nom: t, effectif: vues[t] }; });
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

  // Grist délivre un jeton temporaire (en lecture seule, sauf option ecriture) ; on le renouvelle avant son expiration.
  // Option { ecriture: true } : jeton qui permet aussi d'envoyer des fichiers (widget de gestion). Par défaut : lecture seule.
  function AccesPieces(opts) { this.ecriture = !!(opts && opts.ecriture); this.jeton = null; this.base = null; this.validite = 0; this.expire = 0; this._attente = null; }

  AccesPieces.prototype.obtenir = function () {
    var self = this;
    if (self.jeton && Date.now() < self.expire - config().margeJetonMs) return Promise.resolve(self);
    if (!self._attente) {
      self._attente = global.grist.docApi.getAccessToken({ readOnly: !self.ecriture }).then(function (r) {
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
  AccesPieces.prototype.urlDepot = function () { return this.base + '/attachments'; };
  AccesPieces.prototype.urlMeta = function (id) { return this.base + '/attachments/' + id + '?auth=' + encodeURIComponent(this.jeton); };

  // ---------- lecture d'une table désignée par son nom (widget de gestion) ----------
  // Renvoie { structure, roles, brut, projets, description } : la structure (colonnes, types, choix), la colonne de chaque
  // fonction (voir lierColonnes), les lignes telles que Grist les fournit (pour pré-remplir un formulaire) et les projets
  // mis en forme. Fonctionne sur une table vide.
  function lireTable(idTable, acces) {
    return structureDe(idTable, acces).then(function (st) {
      return global.grist.docApi.fetchTable(idTable).then(function (t) {
        var brut = lignesDe(t), cles = Object.keys(t || {}).filter(function (k) { return k !== 'id'; });
        var roles = lierColonnes(st, cles, true);
        return { structure: st, roles: roles, brut: brut, projets: construire(brut, roles), description: decrire(st, roles, cles) };
      });
    });
  }

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
        var roles = lierColonnes(st, cles);
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
    config: config, echapper: echapper,
    trierProjets: trierProjets, filtrer: filtrer, listeThemes: listeThemes,
    AccesPieces: AccesPieces, demarrer: demarrer,
    // Widget de gestion
    configGestion: configGestion, lireTable: lireTable, structureDe: structureDe,
    baseType: baseType, texte: texte, liste: liste, separerTags: separerTags, pieces: pieces, versDate: versDate,
    normaliser: normaliser, analyserVideos: analyserVideos
  };
})(window);
