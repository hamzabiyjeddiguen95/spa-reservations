# Reservations Spa - Guide de deploiement (sans coder)

Ce guide t'explique comment mettre ce systeme en ligne, etape par etape,
sans avoir besoin de savoir coder.

## Etape 1 - Compte GitHub (stockage du code)

1. Va sur https://github.com/signup
2. Cree un compte (email + mot de passe)
3. Une fois connecte, clique sur le bouton **"+"** en haut a droite -> **"New repository"**
4. Nom du repository : `spa-reservations`
5. Laisse "Public" ou choisis "Private" (les deux marchent)
6. Clique **"Create repository"**
7. Sur la page suivante, clique sur **"uploading an existing file"**
8. Glisse-depose TOUS les fichiers et dossiers de ce projet (le contenu du
   dossier `spa-app`, pas le dossier lui-meme) dans la zone d'upload
9. En bas, clique **"Commit changes"**

Ton code est maintenant sur GitHub.

## Etape 2 - Compte Render (hebergement + base de donnees)

1. Va sur https://render.com et cree un compte (tu peux te connecter avec ton compte GitHub directement, c'est plus simple)
2. Une fois connecte, ajoute un moyen de paiement dans les parametres de ton compte (Settings -> Billing) puisque tu comptes prendre un plan payant (necessaire pour que la base de donnees ne soit jamais supprimee et que le site ne s'endorme jamais)

## Etape 3 - Deployer en un clic (Blueprint)

1. Sur le tableau de bord Render, clique **"New +"** -> **"Blueprint"**
2. Connecte ton compte GitHub si demande, puis choisis le repository `spa-reservations`
3. Render va detecter automatiquement le fichier `render.yaml` et te proposer de creer :
   - un **Web Service** (le site)
   - une **base de donnees PostgreSQL** (`spa-db`)
4. Clique **"Apply"** / **"Deploy Blueprint"**
5. Attends quelques minutes pendant que Render installe et demarre tout (tu verras des logs qui defilent)

## Etape 4 - Initialiser la base de donnees (une seule fois)

1. Une fois le service "spa-reservations" demarre (statut vert "Live"), clique dessus
2. En haut, clique sur l'onglet **"Shell"**
3. Tape cette commande et appuie sur Entree :
   ```
   npm run seed
   ```
4. Ca va creer les tables, les chambres (rooms), et un compte admin par defaut :
   - username : `admin`
   - password : `changeme123`
5. **Important** : connecte-toi une premiere fois avec ce compte, puis demande-moi de t'ajouter un moyen de changer ce mot de passe si besoin.

## Etape 5 - Ajouter les comptes du staff

Les comptes de l'equipe sont deja prets dans le script de demarrage (Bannany
Nouhaila, Izikki Hanane, El Bellaoui Hanane, Lahcen Biyjeddiguen). Pour les
creer, retourne dans l'onglet **Shell** (comme a l'etape 4) et retape :
```
npm run seed
```
Ca ne touche a rien d'existant (reservations, commissions, etc.) - ca ajoute
juste les nouveaux comptes qui manquent encore. Les identifiants de chacun
s'affichent dans le Shell apres la commande.

Si tu ajoutes d'autres personnes plus tard, donne-moi juste les noms et je
les ajoute au script de la meme facon.

## Etape 6 - Utiliser l'application

Ton site est accessible a une adresse du type :
`https://spa-reservations.onrender.com`

Ajoute-la a l'ecran d'accueil de ton telephone (comme une app) :
- iPhone (Safari) : bouton Partager -> "Sur l'ecran d'accueil"
- Android (Chrome) : menu (3 points) -> "Ajouter a l'ecran d'accueil"

## En cas de probleme

Copie-colle le message d'erreur exact (ou une capture d'ecran) et
je t'aide a le resoudre.
