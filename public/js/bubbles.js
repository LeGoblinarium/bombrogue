const Bubbles = (() => {
  let container = null;
  let canvasEl = null;
  let activeBubbles = []; // { id, playerId, el, removeTimer }
  let lastCheckTime = 0;

  const CHECK_INTERVAL  = 8000;  // ms between proximity scans
  const PAIR_CHANCE     = 0.45;  // probability a proximity scan fires pair dialogue
  const SOLO_CHANCE     = 0.12;  // probability a scan fires a solo line (no nearby pair)
  const BUBBLE_DURATION = 4800;  // ms before auto-dismiss
  const RESPONSE_DELAY  = 2600;  // ms before response bubble appears
  const PROXIMITY_CELLS = 5;     // Manhattan distance threshold
  const MAX_BUBBLES     = 3;     // max simultaneous bubbles on screen
  const PAIR_COOLDOWN   = 22000; // ms before same pair can chat again

  const pairCooldowns  = {};  // pairKey → timestamp
  const dialogueIndex  = {};  // pairKey → rotation index

  // ── Dialogue database ───────────────────────────────────────────────────────
  // Keys are alphabetically sorted character ids joined by '-'

  const PAIR_DIALOGUES = {
    'merlin-mordek': [
      [
        { speaker: 'merlin', text: "J'ai toujours détesté la nécromancie." },
        { speaker: 'mordek', text: "La nécromancie est la plus puissante des magies." },
      ],
      [
        { speaker: 'merlin', text: "Tu sens le tombeau fraîchement ouvert, Mordek." },
        { speaker: 'mordek', text: "Et toi tu sens l'arrogance. C'est bien pire." },
      ],
      [
        { speaker: 'merlin', text: "Retourne dans ta tombe !" },
        { speaker: 'mordek', text: "Je l'ai quittée exprès pour te réduire en cendres." },
      ],
      [
        { speaker: 'mordek', text: "Tes sorts sont impressionnants... pour un vivant." },
        { speaker: 'merlin', text: "Tais-toi donc, cadavre ambulant !" },
      ],
      [
        { speaker: 'merlin', text: "Comment peux-tu te battre sans pouls ?" },
        { speaker: 'mordek', text: "C'est très reposant, en fait." },
      ],
      [
        { speaker: 'mordek', text: "Rejoins-moi dans la mort, Merlin. Tu seras plus utile." },
        { speaker: 'merlin', text: "Je préfère encore perdre en étant vivant." },
      ],
      [
        { speaker: 'merlin', text: "Tu n'es qu'une anomalie que la magie devrait corriger." },
        { speaker: 'mordek', text: "Et toi qu'un mortel que le temps corrigera bientôt." },
      ],
      [
        { speaker: 'mordek', text: "Tu te souviens de ton premier sort, Merlin ?" },
        { speaker: 'merlin', text: "Oui. Dommage que tu te souviennes de ta mort." },
      ],
      [
        { speaker: 'merlin', text: "Combien de grimoires as-tu dévorés avant de mourir ?" },
        { speaker: 'mordek', text: "Tous les tiens. Je les ai pris sur ton futur cadavre." },
      ],
      [
        { speaker: 'mordek', text: "Tu vieilliras, Merlin. Moi non." },
        { speaker: 'merlin', text: "Et toi tu pourris. Moi non." },
      ],
      [
        { speaker: 'merlin', text: "La nécromancie est une insulte à l'ordre naturel !" },
        { speaker: 'mordek', text: "L'ordre naturel est ennuyeux." },
      ],
      [
        { speaker: 'mordek', text: "Tu parles beaucoup pour quelqu'un qui va perdre." },
        { speaker: 'merlin', text: "Et toi peu pour quelqu'un qui va souffrir." },
      ],
      [
        { speaker: 'merlin', text: "Tes yeux sont vides, Mordek." },
        { speaker: 'mordek', text: "Ils ont vu assez." },
      ],
      [
        { speaker: 'merlin', text: "Je refuse de perdre contre un cadavre." },
        { speaker: 'mordek', text: "Les cadavres ont moins à perdre." },
      ],
      [
        { speaker: 'mordek', text: "La magie finit toujours par tuer son utilisateur." },
        { speaker: 'merlin', text: "Pas si on la maîtrise. Ce que tu ignores." },
      ],
    ],

    'borin-merlin': [
      [
        { speaker: 'merlin', text: "Nain, as-tu seulement lu un livre de ta vie ?" },
        { speaker: 'borin', text: "J'ai pas besoin de livres pour t'assommer." },
      ],
      [
        { speaker: 'borin', text: "Ta magie c'est du flan, sorcier !" },
        { speaker: 'merlin', text: "Tu n'as pas l'intellect pour comprendre le flan non plus." },
      ],
      [
        { speaker: 'merlin', text: "Recule, Borin, tu bloques ma ligne de vue." },
        { speaker: 'borin', text: "Encore un problème que ton cerveau de génie résout pas." },
      ],
      [
        { speaker: 'borin', text: "C'est quoi ce chapeau ridicule ?" },
        { speaker: 'merlin', text: "C'est un insigne de pouvoir. Quelque chose que tu ignores." },
      ],
      [
        { speaker: 'merlin', text: "Tu mesures combien, exactement ?" },
        { speaker: 'borin', text: "Assez pour te mettre une beigne." },
      ],
      [
        { speaker: 'borin', text: "Ma hache vaut tous tes grimoires réunis." },
        { speaker: 'merlin', text: "Ta hache ne peut pas lire. Avantage à moi." },
      ],
      [
        { speaker: 'merlin', text: "Borin, tu as un plan ?" },
        { speaker: 'borin', text: "Ouais : toi tu meurs en premier." },
      ],
      [
        { speaker: 'borin', text: "T'as jamais travaillé de tes mains, hein ?" },
        { speaker: 'merlin', text: "Mon esprit est mon outil. Bien plus efficace." },
      ],
      [
        { speaker: 'merlin', text: "Je t'ai sauvé la mise trois fois ce tour." },
        { speaker: 'borin', text: "Compte pas sur un merci." },
      ],
      [
        { speaker: 'borin', text: "La magie ça sent le roussi." },
        { speaker: 'merlin', text: "Et les nains ça sent la roche mouillée." },
      ],
      [
        { speaker: 'borin', text: "T'as l'air du genre à lire des cartes avant de se perdre." },
        { speaker: 'merlin', text: "...Je ne me perds jamais." },
      ],
      [
        { speaker: 'merlin', text: "Un peu plus de finesse, Borin !" },
        { speaker: 'borin', text: "Un peu plus de silence, Merlin !" },
      ],
      [
        { speaker: 'borin', text: "T'as des muscles sous cette robe ?" },
        { speaker: 'merlin', text: "J'ai quelque chose de bien plus dangereux." },
      ],
      [
        { speaker: 'merlin', text: "Ta stratégie consiste à foncer dans le tas ?" },
        { speaker: 'borin', text: "Ça marche depuis deux cents ans. J'arrête pas." },
      ],
      [
        { speaker: 'borin', text: "Un sorcier nain, j'en ai jamais vu." },
        { speaker: 'merlin', text: "Parce que la magie requiert un cerveau fonctionnel." },
      ],
    ],

    'kael-merlin': [
      [
        { speaker: 'merlin', text: "La magie elfique manque cruellement de rigueur." },
        { speaker: 'kael', text: "La forêt n'a pas besoin de rigueur pour être éternelle." },
      ],
      [
        { speaker: 'kael', text: "Tu ne trouveras pas la sagesse dans tes grimoires, Merlin." },
        { speaker: 'merlin', text: "Et toi pas davantage en parlant aux arbres." },
      ],
      [
        { speaker: 'merlin', text: "Combien de siècles as-tu, elfe ?" },
        { speaker: 'kael', text: "Assez pour savoir que l'arrogance ne vieillit pas bien." },
      ],
      [
        { speaker: 'kael', text: "Tu brûles l'énergie du monde pour ta gloire personnelle." },
        { speaker: 'merlin', text: "Et toi tu la gaspilles à murmurer aux fougères." },
      ],
      [
        { speaker: 'merlin', text: "La précision elfique, ça ressemble à quoi contre une bombe ?" },
        { speaker: 'kael', text: "Tu vas voir dans quelques secondes." },
      ],
      [
        { speaker: 'kael', text: "Le vent m'a parlé de toi, Merlin. Rien de flatteur." },
        { speaker: 'merlin', text: "Je n'écoute pas les commérages météorologiques." },
      ],
      [
        { speaker: 'merlin', text: "Tes sens elfiques te donnent un avantage. Je l'admets." },
        { speaker: 'kael', text: "Première fois que tu admets quelque chose." },
      ],
      [
        { speaker: 'kael', text: "Tu contrôles la magie. Elle finira par te contrôler." },
        { speaker: 'merlin', text: "Romantique. Et faux." },
      ],
      [
        { speaker: 'merlin', text: "La nature ne décide rien. Elle subit." },
        { speaker: 'kael', text: "Elle décide de tout. Silencieusement." },
      ],
      [
        { speaker: 'kael', text: "Tes sorts blessent la trame du monde." },
        { speaker: 'merlin', text: "La trame du monde me remerciera quand j'aurai gagné." },
      ],
      [
        { speaker: 'merlin', text: "Combien de temps faut-il pour qu'un elfe se décide ?" },
        { speaker: 'kael', text: "Autant qu'il faut." },
      ],
      [
        { speaker: 'kael', text: "Le silence t'est inconnu, Merlin ?" },
        { speaker: 'merlin', text: "Le silence est une perte de temps." },
      ],
      [
        { speaker: 'merlin', text: "Je pourrais te lancer un sort en dormant." },
        { speaker: 'kael', text: "Et moi je pourrais t'abattre les yeux fermés." },
      ],
      [
        { speaker: 'kael', text: "Tu portes le poids de tous tes livres." },
        { speaker: 'merlin', text: "Et toi le poids de ton ego forestier." },
      ],
      [
        { speaker: 'merlin', text: "Tu cours vite pour quelqu'un qui 'écoute la forêt'." },
        { speaker: 'kael', text: "La forêt dit de courir. J'écoute." },
      ],
    ],

    'alaric-mordek': [
      [
        { speaker: 'alaric', text: "Rends-toi ! Tu mourras avec honneur." },
        { speaker: 'mordek', text: "J'ai déjà essayé la mort. C'était décevant." },
      ],
      [
        { speaker: 'mordek', text: "Ton armure est jolie. Je la volerai sur ton cadavre." },
        { speaker: 'alaric', text: "Il faudra me tuer d'abord, créature !" },
      ],
      [
        { speaker: 'alaric', text: "Par mon épée, je te renverrai dans les ténèbres !" },
        { speaker: 'mordek', text: "Mais je les aime, moi, les ténèbres." },
      ],
      [
        { speaker: 'alaric', text: "Un chevalier ne fuit pas. Même face à toi." },
        { speaker: 'mordek', text: "C'est ce que disaient les autres. Ils reposent en paix." },
      ],
      [
        { speaker: 'mordek', text: "Tu crois en l'honneur. Moi je crois en l'éternité." },
        { speaker: 'alaric', text: "L'éternité sans honneur, c'est juste du temps perdu." },
      ],
      [
        { speaker: 'alaric', text: "As-tu une âme, Mordek ?" },
        { speaker: 'mordek', text: "Je l'ai mise quelque part. Je ne me souviens plus où." },
      ],
      [
        { speaker: 'mordek', text: "Ça fait combien de temps que tu portes cette armure ?" },
        { speaker: 'alaric', text: "Depuis que j'ai juré de protéger les innocents. Ce qui t'exclut." },
      ],
      [
        { speaker: 'alaric', text: "Même un mort-vivant peut se racheter !" },
        { speaker: 'mordek', text: "Intéressant. Je vais y réfléchir. Après t'avoir tué." },
      ],
      [
        { speaker: 'alaric', text: "Que cherches-tu dans l'éternité, Mordek ?" },
        { speaker: 'mordek', text: "La paix. Personne pour me déranger." },
      ],
      [
        { speaker: 'mordek', text: "Tu feras un beau chevalier mort-vivant." },
        { speaker: 'alaric', text: "Je mourrai vivant. Merci." },
      ],
      [
        { speaker: 'alaric', text: "L'honneur transcende la mort !" },
        { speaker: 'mordek', text: "Rien ne transcende la mort. Je sais de quoi je parle." },
      ],
      [
        { speaker: 'mordek', text: "Ta loyauté est admirable. Et inutile." },
        { speaker: 'alaric', text: "La loyauté n'est jamais inutile." },
      ],
      [
        { speaker: 'alaric', text: "Quelqu'un t'aimait-il, avant ?" },
        { speaker: 'mordek', text: "...Prochaine question." },
      ],
      [
        { speaker: 'mordek', text: "Ta vertu te rend prévisible." },
        { speaker: 'alaric', text: "Et ta noirceur te rend solitaire." },
      ],
      [
        { speaker: 'alaric', text: "Même les morts méritent la paix !" },
        { speaker: 'mordek', text: "J'ai refusé la mienne. Merci de votre sollicitude." },
      ],
    ],

    'alaric-bob': [
      [
        { speaker: 'alaric', text: "Brave Bob, tiens-toi droit en présence d'un chevalier !" },
        { speaker: 'bob', text: "...Je me tiens comment là ?" },
      ],
      [
        { speaker: 'bob', text: "T'as pas chaud avec toute cette armure ?" },
        { speaker: 'alaric', text: "La chaleur ne touche pas celui qui combat avec honneur." },
      ],
      [
        { speaker: 'alaric', text: "Bob, connais-tu le code de chevalerie ?" },
        { speaker: 'bob', text: "C'est un code promo ou un truc sérieux ?" },
      ],
      [
        { speaker: 'bob', text: "Alaric, t'as déjà eu peur ?" },
        { speaker: 'alaric', text: "...Une fois. Je n'en parle jamais." },
      ],
      [
        { speaker: 'alaric', text: "Un jour je t'apprendrai à manier l'épée, Bob." },
        { speaker: 'bob', text: "Cool. C'est utile contre les bombes ?" },
      ],
      [
        { speaker: 'bob', text: "T'as l'air fatiguant à être, toi." },
        { speaker: 'alaric', text: "La vertu demande des efforts, effectivement." },
      ],
      [
        { speaker: 'alaric', text: "Tu manques de discipline, Bob." },
        { speaker: 'bob', text: "Et toi tu manques de décontraction." },
      ],
      [
        { speaker: 'alaric', text: "Courage, Bob ! Un guerrier ne capitule jamais !" },
        { speaker: 'bob', text: "Je capitule pas, je... recule stratégiquement." },
      ],
      [
        { speaker: 'alaric', text: "Bob, as-tu un code de vie ?" },
        { speaker: 'bob', text: "Euh... éviter les bombes ?" },
      ],
      [
        { speaker: 'bob', text: "T'aurais été quoi si t'avais pas été chevalier ?" },
        { speaker: 'alaric', text: "...Je n'ai jamais envisagé autre chose." },
      ],
      [
        { speaker: 'alaric', text: "Reste derrière moi, Bob. Je ferai bouclier." },
        { speaker: 'bob', text: "Sympa mais... les bombes viennent de partout." },
      ],
      [
        { speaker: 'bob', text: "Pourquoi tu parles tout seul des fois ?" },
        { speaker: 'alaric', text: "Je me rappelle mes serments. C'est important." },
      ],
      [
        { speaker: 'alaric', text: "La noblesse se reconnaît à ses actes, Bob." },
        { speaker: 'bob', text: "J'espère que 'survivre' c'est noble alors." },
      ],
      [
        { speaker: 'bob', text: "T'as un cheval ?" },
        { speaker: 'alaric', text: "Tempête. Il est magnifique et m'attend sagement." },
      ],
      [
        { speaker: 'alaric', text: "Ce combat forgera ton caractère, Bob !" },
        { speaker: 'bob', text: "Mon caractère préfèrerait rester non forgé, merci." },
      ],
    ],

    'borin-kael': [
      [
        { speaker: 'borin', text: "Les elfes ça parle aux arbres. C'est pathétique." },
        { speaker: 'kael', text: "Les arbres répondent. Contrairement aux nains." },
      ],
      [
        { speaker: 'kael', text: "Ta barbe cache-t-elle une âme, Borin ?" },
        { speaker: 'borin', text: "Ma barbe cache mon visage. Ça suffit amplement." },
      ],
      [
        { speaker: 'borin', text: "Tes oreilles pointues me donnent le vertige." },
        { speaker: 'kael', text: "Et ta taille me donne des courbatures." },
      ],
      [
        { speaker: 'borin', text: "Les elfes vivent mille ans et font quoi ? Des poèmes." },
        { speaker: 'kael', text: "Les nains vivent deux cents ans et creusent des trous." },
      ],
      [
        { speaker: 'kael', text: "Tu pourrais apprendre la patience, Borin." },
        { speaker: 'borin', text: "J'ai la patience d'une bombe bien posée. Méfie-toi." },
      ],
      [
        { speaker: 'borin', text: "L'arc c'est pour les lâches. Faut s'approcher pour se battre." },
        { speaker: 'kael', text: "Je me rapproche uniquement pour finir le travail." },
      ],
      [
        { speaker: 'kael', text: "Est-ce que tu chantes parfois, Borin ?" },
        { speaker: 'borin', text: "Oui. Mais seulement quand personne peut m'entendre." },
      ],
      [
        { speaker: 'borin', text: "Un elfe dans une mine, ça dure combien de temps ?" },
        { speaker: 'kael', text: "Assez longtemps pour remarquer ce que tu rates." },
      ],
      [
        { speaker: 'kael', text: "Tu as de l'or dans les yeux, Borin." },
        { speaker: 'borin', text: "Et toi t'as des étoiles dans la tête. C'est moins utile." },
      ],
      [
        { speaker: 'borin', text: "Les arbres poussent trop lentement. Je préfère la roche." },
        { speaker: 'kael', text: "La roche ne fleurit pas." },
      ],
      [
        { speaker: 'kael', text: "Chaque être a une place dans l'équilibre du monde." },
        { speaker: 'borin', text: "La mienne c'est le premier rang. Avec ma hache." },
      ],
      [
        { speaker: 'borin', text: "T'as une famille, toi ?" },
        { speaker: 'kael', text: "La forêt entière est ma famille." },
      ],
      [
        { speaker: 'kael', text: "Tu construis. J'observe. On n'est pas si différents." },
        { speaker: 'borin', text: "Si." },
      ],
      [
        { speaker: 'borin', text: "Pourquoi les elfes sourient tout le temps ?" },
        { speaker: 'kael', text: "Pour ne pas pleurer." },
      ],
      [
        { speaker: 'kael', text: "Cette bombe est à toi ?" },
        { speaker: 'borin', text: "Non. Mais la suivante oui." },
      ],
    ],

    'bob-mordek': [
      [
        { speaker: 'bob', text: "Tu es... vraiment mort ou c'est un déguisement ?" },
        { speaker: 'mordek', text: "..." },
      ],
      [
        { speaker: 'mordek', text: "Quelle âme fade tu as, Bob." },
        { speaker: 'bob', text: "Merci ? Je crois ?" },
      ],
      [
        { speaker: 'bob', text: "Ça fait mal d'être mort-vivant ?" },
        { speaker: 'mordek', text: "Moins que ta question." },
      ],
      [
        { speaker: 'mordek', text: "Je pourrais t'offrir l'éternité, Bob." },
        { speaker: 'bob', text: "Euh... non merci, j'ai déjà des trucs de prévus." },
      ],
      [
        { speaker: 'bob', text: "Tu manges quoi comme truc, toi ?" },
        { speaker: 'mordek', text: "Les espoirs des vivants. C'est très nutritif." },
      ],
      [
        { speaker: 'mordek', text: "Tu n'as aucune ambition, Bob. C'est presque admirable." },
        { speaker: 'bob', text: "J'essaie juste de pas exploser." },
      ],
      [
        { speaker: 'bob', text: "T'as des amis, Mordek ?" },
        { speaker: 'mordek', text: "J'en ai eu. Ils m'obéissent encore." },
      ],
      [
        { speaker: 'bob', text: "T'as une maison, toi ?" },
        { speaker: 'mordek', text: "Un tombeau. Assez spacieux." },
      ],
      [
        { speaker: 'mordek', text: "Je collectionne les âmes, Bob." },
        { speaker: 'bob', text: "T'as celle d'un nommé Dave ?" },
      ],
      [
        { speaker: 'bob', text: "T'as déjà ri ?" },
        { speaker: 'mordek', text: "Une fois. Il y a longtemps. Je ne recommencerai pas." },
      ],
      [
        { speaker: 'mordek', text: "Tu me rappelles quelqu'un que j'ai... absorbé." },
        { speaker: 'bob', text: "...C'est censé me rassurer ?" },
      ],
      [
        { speaker: 'bob', text: "T'as l'air triste." },
        { speaker: 'mordek', text: "Je suis au-delà de la tristesse." },
      ],
      [
        { speaker: 'mordek', text: "L'erreur des vivants : croire qu'ils vont rester vivants." },
        { speaker: 'bob', text: "Wow. Sympa le message." },
      ],
      [
        { speaker: 'bob', text: "Mordek, t'es quand même sympa des fois." },
        { speaker: 'mordek', text: "Ne répète jamais ça." },
      ],
      [
        { speaker: 'mordek', text: "Ton âme a un goût de fromage ordinaire." },
        { speaker: 'bob', text: "Je... prends ça comme un compliment." },
      ],
    ],

    'bob-kael': [
      [
        { speaker: 'bob', text: "Hé, t'as vraiment des oreilles pointues ?" },
        { speaker: 'kael', text: "...Oui." },
      ],
      [
        { speaker: 'kael', text: "Sens-tu la forêt parler, Bob ?" },
        { speaker: 'bob', text: "J'entends surtout les bombes exploser." },
      ],
      [
        { speaker: 'bob', text: "Tu vois bien la nuit avec ces yeux-là ?" },
        { speaker: 'kael', text: "Je vois aussi les erreurs tactiques en plein jour." },
      ],
      [
        { speaker: 'kael', text: "Bob, pourquoi te bats-tu ?" },
        { speaker: 'bob', text: "Bonne question. Je me la pose à chaque tour." },
      ],
      [
        { speaker: 'bob', text: "T'as l'air zen pour quelqu'un entouré de bombes." },
        { speaker: 'kael', text: "La panique consomme de l'énergie. J'économise." },
      ],
      [
        { speaker: 'kael', text: "Tu as un instinct de survie remarquable, Bob." },
        { speaker: 'bob', text: "C'est surtout de la chance." },
      ],
      [
        { speaker: 'bob', text: "Kael, t'arrives à dormir dans les arbres ?" },
        { speaker: 'kael', text: "Mieux que toi dans ton lit, j'imagine." },
      ],
      [
        { speaker: 'kael', text: "Tu es plus courageux que tu n'y parais, Bob." },
        { speaker: 'bob', text: "C'est parce que je vois pas le danger." },
      ],
      [
        { speaker: 'bob', text: "T'as un arc mais t'as pas l'air méchant." },
        { speaker: 'kael', text: "L'arc ne ment pas. Lui." },
      ],
      [
        { speaker: 'kael', text: "Chaque pas laisse une trace. La tienne est lourde." },
        { speaker: 'bob', text: "J'ai mangé avant de venir." },
      ],
      [
        { speaker: 'bob', text: "Kael, t'as jamais voulu être... normal ?" },
        { speaker: 'kael', text: "'Normal' est le plus triste des destins." },
      ],
      [
        { speaker: 'kael', text: "Tu as de la chance, Bob. Cultive-la." },
        { speaker: 'bob', text: "C'est littéralement tout ce que je fais." },
      ],
      [
        { speaker: 'bob', text: "T'as déjà pleuré devant un arbre ?" },
        { speaker: 'kael', text: "...Oui. Et l'arbre a pleuré aussi." },
      ],
      [
        { speaker: 'kael', text: "La nature t'accepte, Bob. C'est rare." },
        { speaker: 'bob', text: "Ah bon ? Sympa la nature." },
      ],
      [
        { speaker: 'bob', text: "On pourrait être amis si on survit ?" },
        { speaker: 'kael', text: "Dans cette vie aussi. Si on survit." },
      ],
    ],

    'alaric-borin': [
      [
        { speaker: 'alaric', text: "Nain, je respecte ton courage." },
        { speaker: 'borin', text: "Garde tes compliments. Donne-moi de l'or." },
      ],
      [
        { speaker: 'borin', text: "Une armure pareille, ça doit valoir une fortune." },
        { speaker: 'alaric', text: "Elle n'est pas à vendre, Borin." },
      ],
      [
        { speaker: 'alaric', text: "Un nain et un chevalier, ça pourrait être une belle alliance." },
        { speaker: 'borin', text: "Faudrait s'entendre sur le partage du butin." },
      ],
      [
        { speaker: 'borin', text: "T'as jamais voulu te battre juste pour l'argent ?" },
        { speaker: 'alaric', text: "L'honneur ne se monnaie pas, Borin." },
      ],
      [
        { speaker: 'alaric', text: "Borin, tiens bon ! Un guerrier ne flanche pas !" },
        { speaker: 'borin', text: "J'avise pas, je charge. Toujours." },
      ],
      [
        { speaker: 'borin', text: "T'as un cheval qui t'attend ?" },
        { speaker: 'alaric', text: "Oui. Il s'appelle Tempête. Il est très bien élevé." },
      ],
      [
        { speaker: 'alaric', text: "Je t'ai vu au combat, Borin. Tu es redoutable." },
        { speaker: 'borin', text: "Et toi t'es pas mauvais pour un gars en fer-blanc." },
      ],
      [
        { speaker: 'borin', text: "C'est quoi ce truc que tu fais avec ton épée ?" },
        { speaker: 'alaric', text: "Une feinte de chevalier. Quatre ans d'entraînement." },
      ],
      [
        { speaker: 'alaric', text: "La discipline forge l'homme, Borin." },
        { speaker: 'borin', text: "L'enclume forge mieux. Et plus vite." },
      ],
      [
        { speaker: 'borin', text: "T'as déjà trinqué avec un nain ?" },
        { speaker: 'alaric', text: "Non. Je suppose que c'est une expérience formatrice." },
      ],
      [
        { speaker: 'alaric', text: "Même les nains ont leur noblesse." },
        { speaker: 'borin', text: "On préfère l'or à la noblesse. C'est plus lourd." },
      ],
      [
        { speaker: 'borin', text: "T'as un écuyer ?" },
        { speaker: 'alaric', text: "Oui. Il attend sagement à l'écurie." },
      ],
      [
        { speaker: 'alaric', text: "La forteresse naine est réputée imprenable." },
        { speaker: 'borin', text: "C'est vrai. Et on loue des chambres." },
      ],
      [
        { speaker: 'borin', text: "T'as jamais voulu enlever cette armure ?" },
        { speaker: 'alaric', text: "Chaque soir. Et chaque matin je la remets." },
      ],
      [
        { speaker: 'alaric', text: "Le courage sans honneur est juste de la violence." },
        { speaker: 'borin', text: "Et l'honneur sans courage c'est du bla-bla." },
      ],
    ],

    'bob-merlin': [
      [
        { speaker: 'bob', text: "Merlin, tu peux me transformer en quelque chose d'utile ?" },
        { speaker: 'merlin', text: "Ma magie a ses limites, hélas." },
      ],
      [
        { speaker: 'merlin', text: "Bob, es-tu même conscient de ce que tu fais ?" },
        { speaker: 'bob', text: "Pas vraiment, non." },
      ],
      [
        { speaker: 'bob', text: "T'as appris la magie où, toi ?" },
        { speaker: 'merlin', text: "Quarante ans d'études. Tu n'as pas le temps." },
      ],
      [
        { speaker: 'merlin', text: "Tu pourrais au moins simuler la compétence, Bob." },
        { speaker: 'bob', text: "J'essaie ! C'est pas évident." },
      ],
      [
        { speaker: 'bob', text: "Merlin, t'as jamais voulu une vie normale ?" },
        { speaker: 'merlin', text: "La normalité est une prison pour esprits médiocres." },
      ],
      [
        { speaker: 'merlin', text: "Suis-moi, Bob. Tu seras moins en danger près de moi." },
        { speaker: 'bob', text: "T'es entouré de bombes, Merlin." },
      ],
      [
        { speaker: 'bob', text: "Tu te trompes parfois ?" },
        { speaker: 'merlin', text: "...J'ai du mal à me souvenir des exemples." },
      ],
      [
        { speaker: 'bob', text: "T'as un apprenti, Merlin ?" },
        { speaker: 'merlin', text: "J'ai essayé. C'était décevant. Un peu comme toi." },
      ],
      [
        { speaker: 'merlin', text: "Bob, tu représentes parfaitement la médiocrité confortable." },
        { speaker: 'bob', text: "...Merci ?" },
      ],
      [
        { speaker: 'bob', text: "T'as des ennemis ?" },
        { speaker: 'merlin', text: "Uniquement des jaloux. C'est différent." },
      ],
      [
        { speaker: 'merlin', text: "Je t'enseignerais bien quelque chose. Mais par où commencer ?" },
        { speaker: 'bob', text: "La base ?" },
      ],
      [
        { speaker: 'bob', text: "Merlin, t'es heureux dans la vie ?" },
        { speaker: 'merlin', text: "Je suis compétent. C'est plus important." },
      ],
      [
        { speaker: 'merlin', text: "La médiocrité ne te pèse pas, Bob ?" },
        { speaker: 'bob', text: "Non. Elle est légère en fait." },
      ],
      [
        { speaker: 'bob', text: "T'arrives à dormir avec ce chapeau ?" },
        { speaker: 'merlin', text: "Le chapeau ne me gêne pas. Toi si." },
      ],
      [
        { speaker: 'merlin', text: "Tu m'irrites, Bob. Mais je ne sais pas pourquoi." },
        { speaker: 'bob', text: "Parce que je m'en fous de ta magie ?" },
      ],
    ],

    'kael-mordek': [
      [
        { speaker: 'kael', text: "La mort n'est qu'un passage vers la forêt éternelle." },
        { speaker: 'mordek', text: "Et moi je bloque le passage. Avec plaisir." },
      ],
      [
        { speaker: 'mordek', text: "Tu mourras comme tous les vivants, elfe." },
        { speaker: 'kael', text: "Et je renaîtrai. Comme tous les arbres." },
      ],
      [
        { speaker: 'kael', text: "La nature rejette ce que tu es, Mordek." },
        { speaker: 'mordek', text: "La nature et moi sommes en désaccord depuis longtemps." },
      ],
      [
        { speaker: 'mordek', text: "Un elfe comme serviteur, ça serait exotique." },
        { speaker: 'kael', text: "Une tentative de plus et tu le regretteras." },
      ],
      [
        { speaker: 'kael', text: "Tu n'as plus de souffle, plus de chaleur, plus de vie." },
        { speaker: 'mordek', text: "Plus de doutes non plus. C'est très pratique." },
      ],
      [
        { speaker: 'mordek', text: "Tu communies avec la nature. J'ai essayé une fois." },
        { speaker: 'kael', text: "Elle t'a dit quoi ?" },
      ],
      [
        { speaker: 'kael', text: "Même les morts ont un lien avec la terre." },
        { speaker: 'mordek', text: "Surtout les morts. On y retourne tous." },
      ],
      [
        { speaker: 'mordek', text: "Les elfes vivent longtemps. Jusqu'à ce qu'ils ne vivent plus." },
        { speaker: 'kael', text: "Et les morts-vivants persistent. Jusqu'à ce qu'on les libère." },
      ],
      [
        { speaker: 'kael', text: "Tu aurais pu choisir la paix, Mordek." },
        { speaker: 'mordek', text: "C'est ennuyeux, la paix." },
      ],
      [
        { speaker: 'mordek', text: "Je pourrais t'offrir une forme d'éternité." },
        { speaker: 'kael', text: "Je préfère vivre un seul jour en paix." },
      ],
      [
        { speaker: 'kael', text: "La nuit t'appartient. Mais l'aube aussi vient." },
        { speaker: 'mordek', text: "Je n'ai pas peur de l'aube." },
      ],
      [
        { speaker: 'mordek', text: "Curieux, un elfe qui n'a pas fui encore." },
        { speaker: 'kael', text: "Je ne fuis que le vide. Et tu en es plein." },
      ],
      [
        { speaker: 'kael', text: "La mort t'a changé profondément." },
        { speaker: 'mordek', text: "Elle m'a surtout... simplifié." },
      ],
      [
        { speaker: 'mordek', text: "Tu communies avec la forêt la nuit aussi ?" },
        { speaker: 'kael', text: "Surtout la nuit." },
      ],
      [
        { speaker: 'kael', text: "Il reste quelque chose d'humain en toi, je le sens." },
        { speaker: 'mordek', text: "Ne le dis pas à voix haute." },
      ],
    ],

    'borin-mordek': [
      [
        { speaker: 'borin', text: "Les morts-vivants méritent pas d'or." },
        { speaker: 'mordek', text: "L'or n'a aucune valeur quand on est réduit en poussière." },
      ],
      [
        { speaker: 'mordek', text: "Tu creuses des tunnels. Je creuse des tombes. On se ressemble." },
        { speaker: 'borin', text: "JAMAIS." },
      ],
      [
        { speaker: 'borin', text: "T'as une odeur de cimetière, Mordek." },
        { speaker: 'mordek', text: "Et toi une odeur de bière. Je préfère le cimetière." },
      ],
      [
        { speaker: 'mordek', text: "Un nain mort-vivant serait redoutable." },
        { speaker: 'borin', text: "Approche encore et tu vas voir ce qu'un nain vivant peut faire." },
      ],
      [
        { speaker: 'borin', text: "Mes ancêtres se retourneraient dans leur tombe en te voyant." },
        { speaker: 'mordek', text: "Ça m'intéresse. Où sont-ils enterrés ?" },
      ],
      [
        { speaker: 'borin', text: "T'as peur de rien, toi ?" },
        { speaker: 'mordek', text: "J'ai peur de l'ennui. Et toi tu m'ennuies." },
      ],
      [
        { speaker: 'borin', text: "Un mort-vivant dans une mine, c'est mauvais présage." },
        { speaker: 'mordek', text: "Un nain dans une tombe, ça fait un bon début." },
      ],
      [
        { speaker: 'mordek', text: "Tu mourras en combat, Borin. Glorieusement. Dommage." },
        { speaker: 'borin', text: "Dommage pour toi. Tu récupères pas ma hache." },
      ],
      [
        { speaker: 'borin', text: "T'as froid ?" },
        { speaker: 'mordek', text: "Je ne ressens plus le froid depuis... longtemps." },
      ],
      [
        { speaker: 'mordek', text: "Un nain mort-vivant pourrait creuser pendant l'éternité." },
        { speaker: 'borin', text: "Si tu m'approches, c'est toi qu'on enterre." },
      ],
      [
        { speaker: 'borin', text: "Tes serviteurs morts, ils touchent un salaire ?" },
        { speaker: 'mordek', text: "Non. C'est un avantage compétitif." },
      ],
      [
        { speaker: 'mordek', text: "Tu as des cicatrices de batailles. Je les sens." },
        { speaker: 'borin', text: "Et toi t'as des vers dans les os. C'est moins romantique." },
      ],
      [
        { speaker: 'borin', text: "La mort c'est pas une fin pour toi ?" },
        { speaker: 'mordek', text: "C'est un début. Je l'ai découvert." },
      ],
      [
        { speaker: 'mordek', text: "Je respecte les nains. Ils savent rester sous la terre." },
        { speaker: 'borin', text: "On en sort aussi. Pour asséner des coups." },
      ],
      [
        { speaker: 'borin', text: "À ta santé, Mordek !" },
        { speaker: 'mordek', text: "Je n'ai pas de santé. Mais j'apprécie le geste." },
      ],
    ],

    'alaric-kael': [
      [
        { speaker: 'alaric', text: "Elfe, combats-tu pour l'honneur ou pour la nature ?" },
        { speaker: 'kael', text: "Les deux sont la même chose, chevalier." },
      ],
      [
        { speaker: 'kael', text: "Tu as la rigidité d'un chêne, Alaric. C'est un compliment." },
        { speaker: 'alaric', text: "Je le prends comme tel. En garde !" },
      ],
      [
        { speaker: 'alaric', text: "On devrait s'allier. La vertu et la nature, ça va ensemble." },
        { speaker: 'kael', text: "Jusqu'à la fin de la partie. Après, on verra." },
      ],
      [
        { speaker: 'kael', text: "Ton épée perturbe l'équilibre de la forêt." },
        { speaker: 'alaric', text: "Mon épée rétablit l'équilibre de la justice." },
      ],
      [
        { speaker: 'alaric', text: "Une flèche ou une épée, le résultat est le même." },
        { speaker: 'kael', text: "Non. La flèche voyage avec le vent. L'épée, non." },
      ],
      [
        { speaker: 'kael', text: "As-tu déjà dormi sous les étoiles, Alaric ?" },
        { speaker: 'alaric', text: "Lors de chaque campagne. C'est froid et humide." },
      ],
      [
        { speaker: 'alaric', text: "Un elfe archer et un chevalier : bonne combinaison." },
        { speaker: 'kael', text: "Jusqu'à ce que nos intérêts divergent." },
      ],
      [
        { speaker: 'kael', text: "Tu protèges les faibles. C'est dans ta nature." },
        { speaker: 'alaric', text: "C'est mon devoir. Ce n'est pas pareil." },
      ],
      [
        { speaker: 'kael', text: "Le monde sera là après nous deux, Alaric." },
        { speaker: 'alaric', text: "C'est réconfortant et déprimant à la fois." },
      ],
      [
        { speaker: 'kael', text: "Tu portes le poids d'un serment lourd." },
        { speaker: 'alaric', text: "Et fièrement." },
      ],
      [
        { speaker: 'alaric', text: "Si je tombe, continue le combat !" },
        { speaker: 'kael', text: "Je n'attendais pas ta permission." },
      ],
      [
        { speaker: 'kael', text: "La forêt dit que tu es tenace, Alaric." },
        { speaker: 'alaric', text: "La forêt a bon goût." },
      ],
      [
        { speaker: 'alaric', text: "Je n'ai jamais combattu aux côtés d'un elfe." },
        { speaker: 'kael', text: "Comment tu trouves ?" },
      ],
      [
        { speaker: 'kael', text: "Sais-tu ce qu'est l'honneur pour un elfe ?" },
        { speaker: 'alaric', text: "Le respect du cycle, j'imagine. Et toi ?" },
      ],
      [
        { speaker: 'alaric', text: "Tu pries quels dieux, Kael ?" },
        { speaker: 'kael', text: "La forêt. Les rivières. Le vent. Ils suffisent." },
      ],
    ],

    'bob-borin': [
      [
        { speaker: 'bob', text: "Borin, t'es un nain en vrai ? Genre... vraiment ?" },
        { speaker: 'borin', text: "Encore une question et tu finiras sous une bombe." },
      ],
      [
        { speaker: 'borin', text: "T'as l'air d'un type normal, toi. C'est suspect." },
        { speaker: 'bob', text: "Je suis juste... là." },
      ],
      [
        { speaker: 'bob', text: "C'est quoi ton truc à toi, Borin ?" },
        { speaker: 'borin', text: "Survivre. Encaisser. Riposter. Dans cet ordre." },
      ],
      [
        { speaker: 'borin', text: "T'as un plan, Bob, ou tu fais quoi là ?" },
        { speaker: 'bob', text: "J'improvise. Ça marche bien... parfois." },
      ],
      [
        { speaker: 'bob', text: "T'as l'air costaud. T'as peur de quoi ?" },
        { speaker: 'borin', text: "Les galeries qui s'effondrent. Et les elfes trop bavards." },
      ],
      [
        { speaker: 'borin', text: "T'as pas de classe, toi. Juste toi et tes poings." },
        { speaker: 'bob', text: "C'est déjà pas mal, non ?" },
      ],
      [
        { speaker: 'bob', text: "Borin, t'as jamais voulu voyager ?" },
        { speaker: 'borin', text: "Si. Vers l'or. C'est tout." },
      ],
      [
        { speaker: 'borin', text: "Bob, tu fais quoi comme métier normalement ?" },
        { speaker: 'bob', text: "Bonne question." },
      ],
      [
        { speaker: 'bob', text: "T'as une famille ?" },
        { speaker: 'borin', text: "Treize frères. Tous mineurs. Tous têtus." },
      ],
      [
        { speaker: 'borin', text: "Tu manges bien au moins ?" },
        { speaker: 'bob', text: "Avant la partie, oui." },
      ],
      [
        { speaker: 'bob', text: "T'as l'air de savoir ce que tu fais." },
        { speaker: 'borin', text: "Ouais. Ça arrive." },
      ],
      [
        { speaker: 'borin', text: "Le problème avec les normaux c'est qu'ils sont imprévisibles." },
        { speaker: 'bob', text: "Merci, je crois." },
      ],
      [
        { speaker: 'bob', text: "C'est quoi le truc le plus fou que t'as fait ?" },
        { speaker: 'borin', text: "J'ai combattu un dragon. J'ai gagné. On en parle plus." },
      ],
      [
        { speaker: 'borin', text: "Ton défaut c'est que tu poses trop de questions." },
        { speaker: 'bob', text: "Et ton défaut c'est que tu réponds jamais." },
      ],
      [
        { speaker: 'bob', text: "Si on survit, on va boire un coup ?" },
        { speaker: 'borin', text: "...Ouais. T'as quelque chose de bien dans le fond." },
      ],
    ],

    'alaric-merlin': [
      [
        { speaker: 'alaric', text: "Merlin, la magie peut-elle remplacer le courage ?" },
        { speaker: 'merlin', text: "Elle peut remplacer beaucoup de choses. Le courage inclus." },
      ],
      [
        { speaker: 'merlin', text: "Tu es brave, Alaric. Dommage que ça ne suffise pas." },
        { speaker: 'alaric', text: "Et la magie ne remplace pas la conviction." },
      ],
      [
        { speaker: 'alaric', text: "Ensemble, sorcier, on serait imbattables." },
        { speaker: 'merlin', text: "Seul je suis déjà imbattable. C'est arithmétique." },
      ],
      [
        { speaker: 'merlin', text: "Ton épée ne pourra rien contre certains de mes sorts." },
        { speaker: 'alaric', text: "Et ta robe n'arrêtera pas mon épée. Quittes." },
      ],
      [
        { speaker: 'alaric', text: "Merlin, la magie peut-elle ressusciter les morts ?" },
        { speaker: 'merlin', text: "Oui. Mais on appelle ça la nécromancie. Je refuse." },
      ],
      [
        { speaker: 'merlin', text: "Tu charges sans réfléchir, Alaric." },
        { speaker: 'alaric', text: "Je charge avec conviction. C'est différent." },
      ],
      [
        { speaker: 'alaric', text: "Avons-nous un plan, Merlin ?" },
        { speaker: 'merlin', text: "Moi oui. Le tien consiste à 'tenir bon'. Ce n'est pas un plan." },
      ],
      [
        { speaker: 'merlin', text: "L'armure ralentit. Les sorts tuent à distance." },
        { speaker: 'alaric', text: "L'armure protège. Les sorciers s'épuisent." },
      ],
      [
        { speaker: 'alaric', text: "Quelle est ta faiblesse, Merlin ?" },
        { speaker: 'merlin', text: "Question idiote. Je n'en ai pas." },
      ],
      [
        { speaker: 'merlin', text: "Tu crois en les dieux, Alaric ?" },
        { speaker: 'alaric', text: "Avec foi absolue. Et toi ?" },
      ],
      [
        { speaker: 'alaric', text: "Tu aurais fait un excellent chevalier, Merlin." },
        { speaker: 'merlin', text: "Et toi un médiocre apprenti. Heureusement pour nous deux." },
      ],
      [
        { speaker: 'merlin', text: "L'honneur est une construction sociale, Alaric." },
        { speaker: 'alaric', text: "Et la magie est une béquille pour ceux qui ne savent pas se battre." },
      ],
      [
        { speaker: 'alaric', text: "Merlin, je t'ai vu hésiter. C'est rare." },
        { speaker: 'merlin', text: "Je réfléchissais. Nuance." },
      ],
      [
        { speaker: 'merlin', text: "Ton code de chevalerie a-t-il une clause pour 'gagner' ?" },
        { speaker: 'alaric', text: "Il dit : gagner avec honneur." },
      ],
      [
        { speaker: 'alaric', text: "Je t'admire, Merlin. Ne le répète à personne." },
        { speaker: 'merlin', text: "...Idem. Et oublie que je l'ai dit." },
      ],
    ],

  };

  // Solo lines per character (when no suitable pair is nearby)
  const SOLO_LINES = {
    player: [
      "Je suis sûr que c'est une bonne idée.",
      "Pourquoi y'a des bombes partout ?",
      "J'aurais dû rester chez moi.",
      "Hm. C'est quoi le plan déjà ?",
      "Ça va aller.",
      "OK panique pas, panique pas...",
      "J'ai un mauvais pressentiment.",
      "Bon. Improvisons.",
      "Qui a eu l'idée des bombes déjà ?",
      "Je stresse là.",
    ],
    merlin: [
      "Pathétique.",
      "Je n'attendais rien de mieux.",
      "Mon intelligence est votre malheur.",
      "La magie résout tout. Sauf la bêtise.",
      "Vous n'êtes que des obstacles temporaires.",
      "Je pourrais tous vous effacer d'un claquement de doigts.",
      "Ces inférieurs me lassent.",
      "La puissance ne s'explique pas. Elle s'inflige.",
      "Je me retiens.",
      "Concentrez-vous, m'a-t-on dit. Soit.",
    ],
    kael: [
      "La forêt me regarde.",
      "Le vent tourne...",
      "Je sens vos peurs.",
      "La terre a de la mémoire.",
      "Chaque bombe est un arbre qui brûle.",
      "Soyez le calme de l'eau, pas sa tempête.",
      "Un arbre ne court pas. Il attend.",
      "L'instinct ne trompe jamais.",
      "Je cours depuis plus longtemps que vous vivez.",
    ],
    borin: [
      "Bande de mauviettes !",
      "Je préfère mon marteau à la magie.",
      "Qu'est-ce que je ferais pas pour de l'or...",
      "Ma mère tapait plus fort que vous.",
      "Avancez ou reculez, mais bougez-vous !",
      "Par Durgin le Profond !",
      "J'aurais dû rester dans ma mine.",
      "Quelqu'un a de la bière ?",
      "Moins on parle, mieux on se bat.",
      "Les bombes c'est bien. L'or c'est mieux.",
    ],
    alaric: [
      "L'honneur guidera mon bras.",
      "Je ne recule devant rien.",
      "Qu'il en soit ainsi.",
      "Par mon épée, je vous aurai tous.",
      "La victoire appartient aux vertueux.",
      "Le devoir passe avant tout.",
      "Un chevalier ne se plaint pas.",
      "Tenez bon !",
      "La peur est un ennemi que l'on choisit de fuir.",
      "Avec honneur, jusqu'au bout.",
    ],
    mordek: [
      "...",
      "Vous souffrirez.",
      "La mort est inévitable. Pour vous.",
      "Vos cendres feront d'excellents serviteurs.",
      "Je me souviens de tous mes ennemis. Très longtemps.",
      "Intéressant.",
      "Tout ceci est si... vivant. Dégoûtant.",
      "La patience est le privilège des immortels.",
      "Je n'ai pas de cœur à briser.",
      "Amusant.",
    ],
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Bob's internal character id is 'player'; dialogue keys and speaker fields
  // use 'bob'. This normalises so lookups always match.
  function normChar(c) { return (c === 'player' || !c) ? 'bob' : c; }

  function pairKey(charA, charB) {
    return [charA, charB].sort().join('-');
  }

  function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────

  function init() {
    container = document.createElement('div');
    container.id = 'bubble-container';
    document.body.appendChild(container);
    canvasEl = document.getElementById('game-canvas');
  }

  function clear() {
    activeBubbles.forEach(b => {
      clearTimeout(b.removeTimer);
      if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
    });
    activeBubbles = [];
  }

  function _dismiss(id) {
    const idx = activeBubbles.findIndex(b => b.id === id);
    if (idx === -1) return;
    const b = activeBubbles[idx];
    clearTimeout(b.removeTimer);
    b.el.classList.add('bubble-out');
    setTimeout(() => { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); }, 350);
    activeBubbles.splice(idx, 1);
  }

  function _spawn(playerId, charKey, text) {
    if (activeBubbles.length >= MAX_BUBBLES) return null;
    // At most one bubble per player at a time
    if (activeBubbles.some(b => b.playerId === playerId)) return null;

    const id = Math.random().toString(36).slice(2);
    const el = document.createElement('div');
    el.className = 'speech-bubble';

    const color = (typeof COLORS !== 'undefined' && COLORS.length) ? COLORS[_colorIndexFor(playerId)] : '#4ECDC4';
    const CHAR_NAMES = { player: 'Bob', bob: 'Bob', merlin: 'Merlin', kael: 'Kael', borin: 'Borin', alaric: 'Alaric', mordek: 'Mordek' };
    const displayName = CHAR_NAMES[charKey] || charKey;

    el.innerHTML =
      `<span class="bubble-name" style="color:${color}">${displayName}</span>` +
      `<span class="bubble-text">${text}</span>`;

    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); _dismiss(id); });

    container.appendChild(el);

    const removeTimer = setTimeout(() => _dismiss(id), BUBBLE_DURATION);
    activeBubbles.push({ id, playerId, el, removeTimer });
    return id;
  }

  // Cache for color lookup — avoid scanning state every frame
  let _colorCache = {};  // playerId → colorIndex

  function _colorIndexFor(playerId) {
    return _colorCache[playerId] !== undefined ? _colorCache[playerId] : 0;
  }

  // ── Position update (called every frame) ────────────────────────────────────

  function _updatePositions(state) {
    if (!activeBubbles.length || !state || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const now  = performance.now();

    for (const b of activeBubbles) {
      const player = state.players.find(p => p.id === b.playerId);
      if (!player) continue;

      let gx = player.x, gy = player.y;
      if (typeof Animations !== 'undefined') {
        const animPos = Animations.getEntityAnimPos(player.id, now);
        if (animPos) { gx = animPos.x; gy = animPos.y; }
      }

      if (typeof Camera === 'undefined') continue;
      const s  = Camera.gridToScreen(gx, gy);
      const cs = Camera.getTransform().cellSize * Camera.getTransform().zoom;

      // Anchor point: top-centre of the character cell
      const screenX = rect.left + s.x + cs * 0.5;
      const screenY = rect.top  + s.y - 8;

      b.el.style.left = screenX + 'px';
      b.el.style.top  = screenY + 'px';
    }
  }

  // ── Proximity check + dialogue selection ────────────────────────────────────

  function _tryFireDialogue(state) {
    const now   = Date.now();
    const alive = state.players.filter(p => p.alive);
    if (alive.length === 0) return;

    // Rebuild color cache
    _colorCache = {};
    for (const p of alive) _colorCache[p.id] = p.colorIndex;

    // Find pairs within proximity
    const nearPairs = [];
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= PROXIMITY_CELLS) {
          nearPairs.push([a, b]);
        }
      }
    }

    if (nearPairs.length === 0) {
      // No nearby pair — rare solo line
      if (Math.random() > SOLO_CHANCE) return;
      const p     = randomOf(alive);
      const char  = p.character || 'player';
      const lines = SOLO_LINES[char] || SOLO_LINES['player'];
      _spawn(p.id, char, randomOf(lines));
      return;
    }

    // At least one nearby pair — try to fire pair dialogue
    if (Math.random() > PAIR_CHANCE) return;

    // Shuffle pairs and try until one fires (respects cooldowns)
    const shuffled = nearPairs.slice().sort(() => Math.random() - 0.5);

    for (const [pa, pb] of shuffled) {
      const charA = normChar(pa.character);
      const charB = normChar(pb.character);
      const key   = pairKey(charA, charB);

      if (pairCooldowns[key] && now - pairCooldowns[key] < PAIR_COOLDOWN) continue;

      const dialogues = PAIR_DIALOGUES[key];
      if (!dialogues || dialogues.length === 0) continue; // no dialogue for this pair, try next

      // Rotate through dialogues to avoid repeating
      if (!dialogueIndex[key]) dialogueIndex[key] = 0;
      const dialogue = dialogues[dialogueIndex[key] % dialogues.length];
      dialogueIndex[key]++;
      pairCooldowns[key] = now;

      const [lineA, lineB] = dialogue;

      // Resolve which live player plays each speaker
      const speakerA = alive.find(p => normChar(p.character) === lineA.speaker);
      const speakerB = alive.find(p => normChar(p.character) === lineB.speaker);
      if (!speakerA || !speakerB) continue;

      _spawn(speakerA.id, lineA.speaker, lineA.text);

      // Response after a short delay
      const sidB   = speakerB.id;
      const charSB = lineB.speaker;
      const textSB = lineB.text;
      setTimeout(() => {
        const s = (typeof GameClient !== 'undefined') ? GameClient.getState() : null;
        if (!s) return;
        const respPlayer = s.players.find(p => p.id === sidB && p.alive);
        if (!respPlayer) return;
        _spawn(sidB, charSB, textSB);
      }, RESPONSE_DELAY);

      return; // fired successfully
    }
    // All nearby pairs on cooldown — skip silently (no fallback solo)
  }

  // ── Main tick (called every animation frame) ─────────────────────────────────

  function tick(state) {
    if (!state || !container) return;

    // Only run while the game screen is actually visible
    const gameScreen = document.getElementById('screen-game');
    if (!gameScreen || !gameScreen.classList.contains('active')) {
      if (activeBubbles.length > 0) clear();
      return;
    }

    _updatePositions(state);

    const now = Date.now();
    if (now - lastCheckTime < CHECK_INTERVAL) return;
    lastCheckTime = now;

    if (activeBubbles.length >= MAX_BUBBLES) return;

    _tryFireDialogue(state);
  }

  return { init, tick, clear };
})();
