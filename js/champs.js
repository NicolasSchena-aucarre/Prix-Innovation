/*
 * Champs du formulaire de gestion : quels champs, avec quelles valeurs, et comment les écrire dans Grist
 * --------------------------------------------------------------------------------------------------------
 * Cette logique ne touche ni à la page ni à Grist : elle transforme la structure de la table (rôles déduits par
 * socle.js) en une liste de champs, convertit les valeurs de Grist en valeurs de formulaire et inversement, et valide
 * la saisie. Aucun nom de colonne n'est écrit ici.
 *
 * Les champs sont ceux des colonnes déclarées dans la section « colonnes » de js/config.js, dans l'ordre de la table.
 * Types pris en charge : texte, nombre entier, nombre décimal, oui/non, date, date et heure, choix unique, choix
 * multiple, adresses de vidéos, images (colonne d'illustration) et documents (colonne de précisions). Les colonnes
 * que Grist remplit lui-même (formule de déclenchement) ne sont jamais proposées.
 *
 * Conventions de Grist :
 *   - une date (type Date) est stockée en secondes depuis 1970, à minuit UTC ;
 *   - une date et heure (type DateTime:Fuseau) est stockée en secondes depuis 1970 (UTC) et se lit dans le fuseau de la colonne ;
 *   - un choix multiple s'écrit ['L', a, b] (liste vide : null) ;
 *   - les vidéos sont dans une colonne de texte, une adresse par ligne ;
 *   - les tags sont dans une colonne de texte, un par ligne (à la lecture, le point-virgule les sépare aussi : voir separateursTags) ;
 *   - les pièces jointes s'écrivent ['L', 29, 30] (aucune : null). Dans le formulaire, une image ou un document est un
 *     jeton : « id:29 » pour une pièce jointe du document ; le fichier choisi et pas encore envoyé (« new:1 ») est géré
 *     par photos.js et doit être remplacé par son « id: » avant l'encodage.
 *
 * Scripts à charger avant ce fichier : js/config.js et js/socle.js.
 */
(function (global) {
  'use strict';

  var S = global.Socle;

  // ---------- dates et fuseaux horaires ----------
  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }

  // Fuseau d'une colonne (« DateTime:Europe/Paris »), à défaut celui des réglages.
  function fuseauDe(colonne) {
    var m = String(colonne && colonne.type || '').split(':').slice(1).join(':');
    var tz = m || S.config().fuseauHoraire;
    try { new Intl.DateTimeFormat('fr-FR', { timeZone: tz }); return tz; } catch (e) { return S.config().fuseauHoraire; }
  }

  // Décalage (en ms) entre l'heure locale du fuseau et UTC, à l'instant donné.
  function decalage(tz, instantMs) {
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(instantMs)).forEach(function (x) { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instantMs / 1000) * 1000;
  }

  // Secondes depuis 1970 -> « AAAA-MM-JJTHH:MM » dans le fuseau.
  function epochVersHeureLocale(secondes, tz) {
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(secondes * 1000)).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }

  // « AAAA-MM-JJTHH:MM » dans le fuseau -> secondes depuis 1970 (null si la saisie n'est pas une date et heure valide).
  function heureLocaleVersEpoch(texte, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texte);
    if (!m) return null;
    var a = +m[1], mo = +m[2], j = +m[3], h = +m[4], mi = +m[5];
    var test = new Date(Date.UTC(a, mo - 1, j, h, mi));
    if (test.getUTCFullYear() !== a || test.getUTCMonth() !== mo - 1 || test.getUTCDate() !== j || h > 23 || mi > 59) return null;
    var devine = Date.UTC(a, mo - 1, j, h, mi), d = decalage(tz, devine), t = devine - d, d2 = decalage(tz, t);
    if (d2 !== d) t = devine - d2;   // passage à l'heure d'été ou d'hiver entre les deux
    return t / 1000;
  }

  function epochVersJour(secondes) {
    var d = new Date(secondes * 1000);
    return d.getUTCFullYear() + '-' + deuxChiffres(d.getUTCMonth() + 1) + '-' + deuxChiffres(d.getUTCDate());
  }
  function jourVersEpoch(texte) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    return (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) ? t / 1000 : null;
  }

  // ---------- champs ----------
  // Liste ordonnée des champs du formulaire. L'ordre est celui des fonctions (titre, sous-titre, résumé, porteur, thème, tags,
  // contact, précisions, illustration, vidéos, puis les colonnes « autres » dans l'ordre du réglage) : il ne dépend pas de la
  // place des colonnes dans la table.
  var ORDRE = ['titre', 'sousTitre', 'resume', 'porteur', 'theme', 'tags', 'contact', 'precisions', 'illustration', 'videos'];

  function champs(structure, roles) {
    var cfg = S.configGestion(), specs = [];
    function ajouter(role, c) {
      if (!c || c.declencheur) return;
      var t = S.baseType(c.type), type = null;
      if (role === 'videos') type = 'videos';
      else if (role === 'tags') type = 'tags';
      else if (role === 'illustration') type = 'photos';
      else if (role === 'precisions') type = 'documents';
      else if (t === 'Text') type = (role === 'titre' || role === 'sousTitre' || role === 'porteur') ? 'texte' : 'texte-long';
      else if (t === 'Int') type = 'entier';
      else if (t === 'Numeric') type = 'decimal';
      else if (t === 'Bool') type = 'oui-non';
      else if (t === 'Date') type = 'date';
      else if (t === 'DateTime') type = 'date-heure';
      else if (t === 'Choice') type = c.choix.length ? 'choix' : 'texte';
      else if (t === 'ChoiceList') type = 'choix-multiple';
      if (!type) return;
      specs.push({
        id: c.id, label: c.label, colonne: c, role: role, type: type,
        obligatoire: (role === 'titre' && cfg.titreObligatoire) || (role === 'sousTitre' && cfg.sousTitreObligatoire),
        choix: c.choix, fuseau: type === 'date-heure' ? fuseauDe(c) : null
      });
    }
    ORDRE.forEach(function (k) { ajouter(k, roles[k]); });
    roles.autres.forEach(function (c) { ajouter('autre', c); });
    return specs;
  }

  // Valeur de Grist -> valeur du formulaire (chaîne, booléen ou liste de chaînes).
  function valeurFormulaire(spec, v) {
    switch (spec.type) {
      case 'oui-non': return v === true;
      case 'entier': return (typeof v === 'number' && isFinite(v)) ? String(v) : '';
      case 'decimal': return (typeof v === 'number' && isFinite(v)) ? String(v).replace('.', ',') : '';   // virgule décimale à l'écran
      case 'date': { var d = S.versDate(v); return d ? epochVersJour(d.getTime() / 1000) : ''; }
      case 'date-heure': { var h = S.versDate(v); return h ? epochVersHeureLocale(h.getTime() / 1000, spec.fuseau) : ''; }
      case 'choix-multiple': return S.liste(v).map(String);
      case 'photos': case 'documents': return S.pieces(v).map(function (n) { return 'id:' + n; });
      case 'tags': return S.separerTags(v);
      default: return S.texte(v);
    }
  }

  // Valeurs d'un nouveau projet : tout est vide.
  function valeursVides(specs) {
    var out = {};
    specs.forEach(function (s) {
      out[s.id] = s.type === 'oui-non' ? false : (s.type === 'choix-multiple' || s.type === 'photos' || s.type === 'documents' || s.type === 'tags') ? [] : '';
    });
    return out;
  }

  // Valeurs d'un projet existant, telles que le formulaire les affiche.
  function valeursDe(specs, ligne) {
    var out = {};
    specs.forEach(function (s) { out[s.id] = valeurFormulaire(s, ligne[s.id]); });
    return out;
  }

  // Valeur du formulaire -> valeur à écrire dans Grist. Renvoie { valeur } ou { erreur } (message à afficher).
  function encoder(spec, v) {
    var vide;
    switch (spec.type) {
      case 'oui-non': return { valeur: v === true };
      case 'choix-multiple': {
        var l = Array.isArray(v) ? v : [];
        return { valeur: l.length ? ['L'].concat(l) : null };
      }
      case 'tags': {   // une liste de tags (ou un texte, séparé comme à la lecture) s'écrit un tag par ligne
        var tags = S.separerTags(Array.isArray(v) ? v.join('\n') : v);
        return { valeur: tags.join('\n') };
      }
      case 'photos': case 'documents': {
        var jetons = Array.isArray(v) ? v : [], ids = [];
        for (var k = 0; k < jetons.length; k++) {
          var m = /^id:(\d+)$/.exec(jetons[k]);
          if (!m) return { erreur: 'Un fichier n’a pas encore été envoyé.' };
          ids.push(Number(m[1]));
        }
        return { valeur: ids.length ? ['L'].concat(ids) : null };
      }
      default: vide = String(v == null ? '' : v).trim() === '';
    }
    var t = String(v == null ? '' : v);
    if (vide) return spec.obligatoire ? { erreur: 'Renseignez « ' + spec.label + ' ».' } : { valeur: spec.type === 'texte' || spec.type === 'texte-long' || spec.type === 'choix' || spec.type === 'videos' ? '' : null };
    switch (spec.type) {
      case 'texte': return { valeur: t.trim() };
      case 'texte-long': return { valeur: t.replace(/\r\n?/g, '\n').replace(/\s+$/, '') };
      case 'choix': return spec.choix.indexOf(t) === -1 && t !== spec.valeurActuelle ? { erreur: 'Choisissez une valeur de la liste.' } : { valeur: t };
      case 'entier': return /^[+-]?\d+$/.test(t.trim()) ? { valeur: parseInt(t.trim(), 10) } : { erreur: 'Saisissez un nombre entier, par exemple 12.' };
      case 'decimal': {
        var n = Number(t.trim().replace(/\s/g, '').replace(',', '.'));
        return (isFinite(n) && /\d/.test(t)) ? { valeur: n } : { erreur: 'Saisissez un nombre, par exemple 12,5.' };
      }
      case 'date': { var j = jourVersEpoch(t); return j === null ? { erreur: 'Saisissez une date valide.' } : { valeur: j }; }
      case 'date-heure': { var e = heureLocaleVersEpoch(t, spec.fuseau); return e === null ? { erreur: 'Saisissez une date et une heure valides.' } : { valeur: e }; }
      case 'videos': {
        var lignes = t.replace(/\r\n?/g, '\n').split('\n'), propres = [];
        for (var i = 0; i < lignes.length; i++) {
          var s = lignes[i].trim();
          if (!s) continue;
          if (S.analyserVideos(s)[0].type === 'invalide') return { erreur: 'La ligne ' + (i + 1) + ' n’est pas une adresse web valide (elle doit commencer par http:// ou https://).' };
          propres.push(s);
        }
        return { valeur: propres.join('\n') };
      }
    }
    return { erreur: 'Type de champ non pris en charge.' };
  }

  // Encode tout le formulaire. Renvoie { valeurs: {colonne: valeur}, erreurs: {colonne: message} }.
  function encoderTout(specs, formulaire) {
    var valeurs = {}, erreurs = {};
    specs.forEach(function (s) {
      var r = encoder(s, formulaire[s.id]);
      if (r.erreur) erreurs[s.id] = r.erreur; else valeurs[s.id] = r.valeur;
    });
    return { valeurs: valeurs, erreurs: erreurs };
  }

  // Identifiants des champs dont la valeur affichée a changé.
  function champsModifies(specs, avant, apres) {
    return specs.filter(function (s) { return JSON.stringify(avant[s.id]) !== JSON.stringify(apres[s.id]); }).map(function (s) { return s.id; });
  }

  // Création : on n'écrit que les valeurs renseignées, Grist applique ses valeurs par défaut aux autres.
  function valeursACreer(specs, formulaire) {
    var r = encoderTout(specs, formulaire), fields = {};
    if (Object.keys(r.erreurs).length) return { erreurs: r.erreurs };
    specs.forEach(function (s) {
      var v = r.valeurs[s.id];
      if (v === null || v === '' || v === false) return;
      fields[s.id] = v;
    });
    return { fields: fields };
  }

  // Les mêmes colonnes, telles que Grist les fournit : sert à repérer une modification faite ailleurs.
  function empreinte(specs, ligne) {
    return JSON.stringify(specs.map(function (s) { return ligne ? ligne[s.id] : null; }));
  }

  global.Champs = {
    champs: champs, valeursVides: valeursVides, valeursDe: valeursDe, encoder: encoder, encoderTout: encoderTout,
    champsModifies: champsModifies, valeursACreer: valeursACreer, empreinte: empreinte,
    // outils de date, exposés pour les tests
    epochVersHeureLocale: epochVersHeureLocale, heureLocaleVersEpoch: heureLocaleVersEpoch, epochVersJour: epochVersJour, jourVersEpoch: jourVersEpoch
  };
})(window);
