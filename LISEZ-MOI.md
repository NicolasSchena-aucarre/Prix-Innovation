# Widget Projets : liste de cartes, recherche, filtre par balise, détail

Widget personnalisé Grist en lecture seule, conforme au Système de Design de l'État (maquette A).

## Contenu du dossier

| Élément | Rôle |
|---|---|
| `index.html` | Le widget à ajouter dans Grist |
| `js/widget.js` | Recherche, filtre, pagination, fenêtre de détail |
| `js/config.js` | **Tous les réglages** (accès, cartes par page, colonnes, vidéos sans clic…) |
| `js/socle.js` | Lecture de la table, nettoyage des valeurs, accès aux pièces jointes |
| `css/app.css` | Mise en page propre au widget (grille, fenêtre de détail) |
| `dsfr/` | Fichiers officiels du DSFR 1.15.4, **non modifiés** (CSS, 4 polices Marianne, 9 icônes, 2 pictogrammes) |
| `serveur.py` | Serveur local de développement, sans cache |
| `test-photos.html` | Test d'accès aux photos pour un visiteur anonyme |
| `verif-socle.html` | Vérification des colonnes associées et des données lues |

## Essayer en local (Linux Mint)

1. Ouvrir un terminal dans ce dossier et lancer : `python3 serveur.py`
2. Dans Grist, ajouter un widget « Personnalisé » avec l'adresse `http://localhost:8080/index.html`
3. Arrêter avec Ctrl + C.

## Configuration dans Grist

- **Accès : « accès complet »**. Grist ne délivre le jeton d'accès aux pièces jointes qu'à ce niveau. Le widget n'écrit jamais dans le document ; un visiteur anonyme ne peut lire que ce que les règles d'accès (ACL) lui permettent.
- **Colonnes** : le widget cherche dans la table les colonnes dont le nom est prévu dans `js/config.js` (par défaut `Titre`, `Description`, `Balise`, `DateAjout`, `Photos`, `Couverture`, `Videos`, `Transcription`), sans tenir compte des accents, de la casse, des espaces ni des tirets bas. Si vos colonnes portent d'autres noms, changez la valeur correspondante dans `config.js`, ou associez-les à la main dans le panneau de configuration de Grist : une association manuelle est toujours prioritaire. La page `verif-socle.html` indique, pour chaque colonne, celle qui a été trouvée et comment.
- **Table** : un widget personnalisé doit toujours être rattaché à une table dans Grist (choix de la table à l'ajout du widget). Pour ne pas refaire ce réglage à chaque document, enregistrer un document modèle contenant la page et le widget déjà configurés, et le copier.
- **Colonnes attendues** :

| Colonne attendue | Type Grist | |
|---|---|---|
| Titre | Texte | obligatoire |
| Description | Texte | obligatoire |
| Balise | Choix ou Choix multiple | facultative |
| Date d'ajout | Date ou Date et heure | facultative |
| Photos | Pièces jointes | facultative |
| Couverture | Pièces jointes | facultative : image allégée prioritaire sur la première photo pour la carte |
| Vidéos | Texte | facultative : une adresse par ligne (YouTube, Vimeo, PeerTube, fichier .mp4) |
| Transcription | Texte | facultative : affichée sous la vidéo |

## Vidéos et images par défaut

- Le lecteur d'une vidéo n'est chargé qu'après le clic sur « Lancer la vidéo ». Sous chaque vidéo, un lien « Ouvrir la vidéo sur … » permet de l'ouvrir sur son site d'origine : c'est le recours si un lecteur externe n'affiche rien (le widget ne peut pas le détecter).
- Une vidéo hébergée directement (fichier .webm ou .mp4) qui ne peut pas être lue déclenche un message explicatif. Le WebM est lu partout ; le MP4 demande les codecs H.264.
- Un projet sans couverture ni photo affiche un pictogramme officiel du DSFR sur fond bleu clair (« vidéo » ou « images »). Pour une vraie image d'accroche, renseigner la colonne Couverture.

## Réglages

Tous les réglages sont dans `js/config.js`, commentés un par un : niveau d'accès, nombre de cartes par page, hôtes dont les vidéos s'affichent sans clic, noms des colonnes, délais techniques. Un réglage invalide est signalé dans le widget par un message explicite.

Un seul réglage est ailleurs : l'adresse de l'interface de programmation de Grist, dans `index.html` (et dans les deux pages de diagnostic). Pour éviter tout appel à un domaine extérieur, remplacer `https://docs.getgrist.com/grist-plugin-api.js` par `https://votre-instance/grist-plugin-api.js`.

## Publication (GitHub Pages)

Publier tout le dossier tel quel : les feuilles de style du DSFR référencent les polices et les icônes par des chemins relatifs, il faut donc conserver l'arborescence `dsfr/`. L'adresse du widget dans Grist est alors celle de `index.html`.

## Avant la mise en ligne

- Vérifier les règles d'accès (ACL) du document final avec un visiteur anonyme, en particulier la lecture des pièces jointes et les éventuelles cellules masquées.
- Le DSFR est réservé aux sites et applications des services de l'État : confirmer l'agrément et l'adresse d'affichage, ainsi que les conditions d'utilisation de la police Marianne.
