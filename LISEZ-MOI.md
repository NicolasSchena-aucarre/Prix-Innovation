# Widget Projets : liste de cartes, recherche, filtre par balise, détail

Widget personnalisé Grist en lecture seule, conforme au Système de Design de l'État (maquette A).

## Contenu du dossier

| Élément | Rôle |
|---|---|
| `index.html` | Le widget à ajouter dans Grist |
| `js/widget.js` | Recherche, filtre, pagination, fenêtre de détail |
| `js/config.js` | **Tous les réglages** (accès, cartes par page, vidéos sans clic, langue, lecteurs vidéo…) |
| `js/socle.js` | Lecture de la table, nettoyage des valeurs, accès aux pièces jointes |
| `css/app.css` | Mise en page propre au widget (grille, fenêtre de détail) |
| `dsfr/` | Fichiers officiels du DSFR 1.15.4, **non modifiés** (CSS, 4 polices Marianne, 9 icônes, 2 pictogrammes) |
| `serveur.py` | Serveur local de développement, sans cache |
| `test-photos.html` | Test d'accès aux photos pour un visiteur anonyme |
| `verif-socle.html` | Vérification : rôle attribué à chaque colonne et données lues |
| `test-schema.html` | Diagnostic : ce que Grist laisse lire de la structure de la table |

## Essayer en local (Linux Mint)

1. Ouvrir un terminal dans ce dossier et lancer : `python3 serveur.py`
2. Dans Grist, ajouter un widget « Personnalisé » avec l'adresse `http://localhost:8080/index.html`
3. Arrêter avec Ctrl + C.

## Configuration dans Grist

- **Accès : « accès complet »**. Grist ne délivre le jeton d'accès aux pièces jointes qu'à ce niveau. Le widget n'écrit jamais dans le document ; un visiteur anonyme ne peut lire que ce que les règles d'accès (ACL) lui permettent.
- **Aucune association de colonnes.** Le widget lit la table à laquelle il est rattaché et décide seul du rôle de chaque colonne, d'après son **type**, son **libellé** et son **ordre**, sans jamais regarder son nom. Le panneau de configuration de Grist n'a donc rien à associer.
- **Table** : un widget personnalisé doit toujours être rattaché à une table dans Grist (choix de la table à l'ajout du widget). Pour ne pas refaire ce réglage à chaque document, enregistrer un document modèle contenant la page et le widget déjà configurés, et le copier.

## Comment le widget comprend la table

| Colonne de la table | Rôle dans le widget |
|---|---|
| Pièces jointes (toutes) | Galerie du projet ; la première image sert de couverture sur la carte |
| Première date (Date ou Date et heure) | Date affichée et tri du plus récent au plus ancien |
| Premier choix (Choix ou Choix multiple) | Balises et filtre ; le libellé du filtre est celui de la colonne |
| Texte dont les lignes sont des adresses de vidéos (YouTube, Vimeo, PeerTube, fichier .mp4 ou .webm) | Vidéos |
| Première, puis deuxième colonne de texte **renseignée** | Titre, puis description |
| Toute autre colonne (autre texte, nombre, booléen, autre date ou choix) | Champ affiché dans le détail, sous son libellé |

À savoir :
- **L'ordre des colonnes compte** : le titre doit être la première colonne de texte, la description la deuxième. Une colonne de texte vide est ignorée pour cette attribution.
- **La recherche porte sur le titre et la description**, pas sur les autres champs.
- **Colonnes écartées** : colonnes-formule (y compris les « colonnes vides » dont le type n'est pas encore choisi), colonnes de référence vers une autre table, colonnes techniques.
- **Une colonne ajoutée** dans Grist apparaît d'elle-même dans le détail des projets.
- **Lecture de la structure** : par les métadonnées de Grist, à défaut par son interface web, à défaut par la seule forme des valeurs (sans libellés). La page `verif-socle.html` indique laquelle a servi.
- **Transcription d'une vidéo** : comme toute autre colonne de texte, elle s'affiche dans le détail sous son libellé.

## Vidéos et images par défaut

- Le lecteur d'une vidéo n'est chargé qu'après le clic sur « Lancer la vidéo ». Sous chaque vidéo, un lien « Ouvrir la vidéo sur … » permet de l'ouvrir sur son site d'origine : c'est le recours si un lecteur externe n'affiche rien (le widget ne peut pas le détecter).
- Une vidéo hébergée directement (fichier .webm ou .mp4) qui ne peut pas être lue déclenche un message explicatif. Le WebM est lu partout ; le MP4 demande les codecs H.264.
- Un projet sans couverture ni photo affiche un pictogramme officiel du DSFR sur fond bleu clair (« vidéo » ou « images »). Pour une vraie image d'accroche, ajouter une image dans la colonne de pièces jointes du projet (la première image sert de couverture).

## Réglages

Tous les réglages sont dans `js/config.js`, commentés un par un : niveau d'accès, nombre de cartes par page, hôtes dont les vidéos s'affichent sans clic, langue et fuseau horaire, adresses des lecteurs vidéo, délais techniques. Aucun nom de colonne n'y figure : le widget les lit dans la table. Un réglage invalide est signalé dans le widget par un message explicite.

Un seul réglage est ailleurs : l'adresse de l'interface de programmation de Grist, dans `index.html` (et dans les deux pages de diagnostic). Pour éviter tout appel à un domaine extérieur, remplacer `https://docs.getgrist.com/grist-plugin-api.js` par `https://votre-instance/grist-plugin-api.js`.

## Publication (GitHub Pages)

Publier tout le dossier tel quel : les feuilles de style du DSFR référencent les polices et les icônes par des chemins relatifs, il faut donc conserver l'arborescence `dsfr/`. L'adresse du widget dans Grist est alors celle de `index.html`.

## Avant la mise en ligne

- Vérifier les règles d'accès (ACL) du document final avec un visiteur anonyme, en particulier la lecture des pièces jointes et les éventuelles cellules masquées.
- Le DSFR est réservé aux sites et applications des services de l'État : confirmer l'agrément et l'adresse d'affichage, ainsi que les conditions d'utilisation de la police Marianne.
