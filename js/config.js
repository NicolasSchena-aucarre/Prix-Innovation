/*
 * Réglages du widget « Projets »
 * ------------------------------
 * Tout ce qui peut changer sans toucher à la logique du widget se règle ici, et nulle part ailleurs.
 * Ce fichier doit être chargé avant socle.js et widget.js (voir index.html, test-photos.html et verif-socle.html).
 * Une valeur invalide est signalée dans le widget par un message explicite.
 */
window.CONFIG_PROJETS = {

  // Niveau d'accès demandé à Grist. « full » est nécessaire pour obtenir le jeton qui permet d'afficher
  // les photos (pièces jointes) et pour reconnaître les colonnes sans association manuelle.
  // Le widget ne modifie jamais le document, quel que soit ce niveau.
  acces: 'full',

  // Nombre de cartes par page (9 = 3 colonnes × 3 lignes).
  // Les photos sont chargées en taille d'origine, car l'API de Grist ne fournit pas de vignettes :
  // une valeur plus basse allège les pages.
  parPage: 9,

  // Hôtes dont les vidéos s'affichent d'emblée dans la fenêtre de détail, sans bouton « Lancer la vidéo ».
  // L'hôte qui sert le widget est toujours inclus. Réservé aux hôtes que vous maîtrisez : un service tiers
  // (YouTube, Vimeo, un PeerTube extérieur…) reçoit l'adresse IP du visiteur dès que son lecteur est inséré.
  // Exemple : ['videos.exemple.gouv.fr']
  hotesSansClic: [],

  // Colonnes de la table : à gauche, le rôle de la colonne dans le widget (ne pas modifier) ;
  // à droite, le nom de la colonne dans Grist (sans tenir compte des accents, de la casse, des espaces ni des tirets bas).
  // Si les colonnes de votre table portent d'autres noms, changez uniquement la valeur de droite.
  // Une association faite à la main dans le panneau de configuration de Grist reste toujours prioritaire.
  colonnes: {
    Titre: 'Titre',
    Description: 'Description',
    Balise: 'Balise',
    DateAjout: 'DateAjout',
    Photos: 'Photos',
    Couverture: 'Couverture',
    Videos: 'Videos',
    Transcription: 'Transcription'
  },

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

  // Réglages techniques (inutile d'y toucher en général).
  delaiSaisieMs: 200,    // délai après la dernière frappe avant de lancer la recherche
  margeImagesPx: 200,    // une photo commence à se charger quand elle est à moins de cette distance de l'écran
  margeJetonMs: 30000,   // le jeton d'accès aux photos est renouvelé quand il lui reste moins de ce délai
  seuilBalayagePx: 40    // distance minimale d'un glissement du doigt pour passer au média suivant ou précédent
};
