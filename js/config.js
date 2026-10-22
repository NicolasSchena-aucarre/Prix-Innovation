/*
 * Réglages du widget « Projets »
 * ------------------------------
 * Tout ce qui peut changer sans toucher à la logique du widget se règle ici, et nulle part ailleurs.
 * Ce fichier doit être chargé avant socle.js et widget.js (voir index.html, test-photos.html et verif-socle.html),
 * et avant socle.js et gestion.js pour le widget de gestion.
 * Une valeur invalide est signalée dans le widget par un message explicite.
 */
window.CONFIG_PROJETS = {

  // Niveau d'accès demandé à Grist. « full » est nécessaire pour obtenir le jeton qui permet d'afficher
  // les photos (pièces jointes) et pour lire toutes les colonnes de la table sans rien associer.
  // Le widget de lecture (widget.js) ne modifie jamais le document, quel que soit ce niveau.
  // Le widget de gestion demande toujours « full », quelle que soit cette valeur.
  acces: 'full',

  // Nombre de cartes par page (la maquette retenue en prévoit 10 ou 20 en production).
  // Les illustrations sont chargées en taille d'origine, car l'API de Grist ne fournit pas de vignettes :
  // une valeur plus basse allège les pages.
  parPage: 10,

  // Classement de la liste publique : 'recents' (le dernier projet créé en premier), 'anciens' (le premier créé en premier)
  // ou 'titre' (ordre alphabétique des titres). Le classement « récents » suit l'ordre de création des lignes dans Grist.
  // La liste de la gestion est toujours classée du plus récent au plus ancien.
  tri: 'recents',

  // Colonnes de la table des projets, désignées par leur nom (le libellé affiché dans Grist, ou son identifiant :
  // la casse, les accents et la ponctuation ne comptent pas). C'est le seul endroit où figurent des noms de colonnes.
  // Laisser '' pour une colonne facultative qui n'existe pas : la fonction correspondante est alors désactivée.
  // Une colonne introuvable, ou d'un type qui ne convient pas, est signalée par un message qui la nomme.
  // Seules les colonnes déclarées ici sont lues, affichées et modifiables : une autre colonne de la table
  // (note interne, par exemple) n'apparaît jamais, sauf si elle est ajoutée à « autres ».
  colonnes: {
    titre: 'Titre',                // obligatoire · texte
    sousTitre: 'Sous-titre',       // obligatoire · texte · affiché sur la carte
    resume: 'Résumé',              // texte · fenêtre de détail et recherche
    porteur: 'Porteur',            // texte, choix ou choix multiple · organisme qui porte le projet
    theme: 'Thème',                // choix multiple · filtre de la liste
    tags: 'Tags',                  // texte · un tag par ligne (ou séparés par un caractère de « separateursTags ») · à la place de l'illustration quand il n'y en a pas
    contact: 'Contact',            // texte · fenêtre de détail
    precisions: 'Précisions',      // pièces jointes · documents (PDF…) proposés en lien dans la fenêtre de détail
    illustration: 'Illustration',  // pièces jointes · image(s) : la première illustre la carte
    videos: 'Videos',              // texte · une adresse de vidéo par ligne
    autres: []                     // noms d'autres colonnes à afficher dans le détail, avec leur libellé
  },

  // Caractères qui séparent les tags dans la colonne de texte des tags, en plus du retour à la ligne.
  // Un tag est une phrase libre : évitez la virgule, que les phrases contiennent souvent. '' pour n'accepter que le retour à la ligne.
  separateursTags: ';',

  // Textes de l'interface qui ne se déduisent pas du nom d'une colonne.
  libelles: {
    tousLesThemes: 'Tous les thèmes'
  },

  // Hôtes dont les vidéos s'affichent d'emblée dans la fenêtre de détail, sans bouton « Lancer la vidéo ».
  // L'hôte qui sert le widget est toujours inclus. Réservé aux hôtes que vous maîtrisez : un service tiers
  // (YouTube, Vimeo, un PeerTube extérieur…) reçoit l'adresse IP du visiteur dès que son lecteur est inséré.
  // Exemple : ['videos.exemple.gouv.fr']
  hotesSansClic: [],

  // Langue et fuseau horaire utilisés pour afficher les dates et les nombres.
  langue: 'fr-FR',
  fuseauHoraire: 'Europe/Paris',

  // Adresses des lecteurs vidéo. {id} est remplacé par l'identifiant de la vidéo, {origine} par l'adresse du site
  // PeerTube (par exemple https://tube.exemple.fr). Le mode « sans cookies » de YouTube et le paramètre dnt de
  // Vimeo limitent le suivi des visiteurs.
  lecteurs: {
    youtube: 'https://www.youtube-nocookie.com/embed/{id}',
    vimeo: 'https://player.vimeo.com/video/{id}?dnt=1',
    peertube: '{origine}/videos/embed/{id}'
  },

  // Widget de gestion (ajout, modification et suppression de projets). Ces réglages ne concernent pas le widget
  // de lecture. Aucun nom de colonne ici : les colonnes se déduisent de la structure de la table.
  gestion: {
    // Nom de la table des projets. Le widget de gestion est rattaché à une autre table (réservée au propriétaire,
    // voir les règles d'accès) : il lit et écrit celle-ci par son nom.
    table: 'Projet',

    // Numéro du projet (colonne « N° »), visible dans la gestion et jamais modifiable. Il est calculé par Grist à la création,
    // par une formule de déclenchement. Ce nom n'est lu que par le widget de gestion : le widget public ignore cette colonne.
    // Laisser '' pour ne pas l'afficher.
    numero: 'N°',

    // Un projet sans titre (ou sans sous-titre) est refusé à l'enregistrement.
    titreObligatoire: true,
    sousTitreObligatoire: true,

    // Recharger les projets quand l'onglet redevient visible. Les modifications faites ailleurs ne sont pas poussées
    // vers ce widget (il n'est pas rattaché à la table des projets) : le bouton « Actualiser » reste toujours disponible.
    actualisationAuRetour: true,

    // Documents (colonne « précisions ») : envoyés tels quels, sans transformation.
    documents: {
      formats: ['application/pdf'],   // types de fichiers acceptés
      poidsMaxMo: 25                  // un fichier plus lourd est refusé
    },

    // Illustrations envoyées : réduites dans le navigateur avant l'envoi (l'API de Grist ne fournit pas de vignettes,
    // donc le poids des originaux se retrouve ensuite dans le widget de lecture).
    photos: {
      formats: ['image/jpeg', 'image/png', 'image/webp'],  // types de fichiers acceptés à la sélection
      poidsMaxSourceMo: 25,    // un fichier plus lourd est refusé avant même la réduction
      largeurMaxPx: 1600,      // plus grand côté de la photo envoyée (une photo plus petite n'est pas agrandie)
      qualite: 0.82,           // qualité de la compression, entre 0 (exclu) et 1
      formatSortie: 'image/jpeg'   // image/jpeg ou image/webp
    }
  },

  // Réglages techniques (inutile d'y toucher en général).
  delaiSaisieMs: 200,    // délai après la dernière frappe avant de lancer la recherche
  margeImagesPx: 200,    // une photo commence à se charger quand elle est à moins de cette distance de l'écran
  margeJetonMs: 30000,   // le jeton d'accès aux photos est renouvelé quand il lui reste moins de ce délai
  seuilBalayagePx: 40    // distance minimale d'un glissement du doigt pour passer au média suivant ou précédent
};
