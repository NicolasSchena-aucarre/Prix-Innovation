# Widget Projets : liste de cartes, recherche, filtre par balise, détail

Widget personnalisé Grist en lecture seule, conforme au Système de Design de l'État (maquette A).

## Contenu du dossier

| Élément | Rôle |
|---|---|
| `index.html` | Le widget à ajouter dans Grist |
| `js/widget.js` | Recherche, filtre, pagination, fenêtre de détail |
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
- **Colonnes à associer** (panneau de configuration du widget) :

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

- **Cartes par page** : constante `PAR_PAGE` en tête de `js/widget.js` (9 par défaut). Les photos sont chargées en taille d'origine, car l'API de Grist ne fournit pas de vignettes : une valeur plus basse allège les pages.
- **Interface de programmation de Grist** : `index.html` charge `grist-plugin-api.js` depuis `docs.getgrist.com`. Pour éviter tout appel extérieur, remplacer l'adresse par celle de votre instance (`https://votre-instance/grist-plugin-api.js`).

## Publication (GitHub Pages)

Publier tout le dossier tel quel : les feuilles de style du DSFR référencent les polices et les icônes par des chemins relatifs, il faut donc conserver l'arborescence `dsfr/`. L'adresse du widget dans Grist est alors celle de `index.html`.

## Avant la mise en ligne

- Vérifier les règles d'accès (ACL) du document final avec un visiteur anonyme, en particulier la lecture des pièces jointes et les éventuelles cellules masquées.
- Le DSFR est réservé aux sites et applications des services de l'État : confirmer l'agrément et l'adresse d'affichage, ainsi que les conditions d'utilisation de la police Marianne.
