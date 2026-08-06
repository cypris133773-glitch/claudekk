// The pilgrimage.
//
// Thirteen chapters, each a corridor you walk left to right with events pinned
// at fixed positions — scenes, chests, save spheres, shops, a cloister puzzle,
// a minigame, a boss at the end. Linear on purpose: so was the game this is
// wearing the skin of.
//
// 18+. Everything below is satire and fiction. The "Richard Heart" in here is a
// character in a video game about a fake religion on a fake blockchain, and any
// resemblance to a real man with a real wristwatch is the entire joke.

const S = (...lines) => lines.map(([who, text]) => ({ who, text }));

export const SPEAKERS = {
  narr: { name: '', tone: 'narr' },
  sys: { name: 'SYSTEM', tone: 'sys' },
  dipus: { name: 'Dipus', tone: 'dipus' },
  yield: { name: 'Yield', tone: 'yield' },
  audit: { name: 'Audit', tone: 'audit' },
  wojak: { name: 'Wojak', tone: 'wojak' },
  luna: { name: 'Luna', tone: 'luna' },
  copi: { name: 'Copi', tone: 'copi' },
  rugku: { name: 'Rugku', tone: 'rugku' },
  heart: { name: 'Richard Heart', tone: 'heart' },
  priest: { name: 'Priest of the Ticker', tone: 'npc' },
  crusader: { name: 'Crusader', tone: 'npc' },
  crowd: { name: 'The Faithful', tone: 'npc' },
  ronso: { name: 'Ronso Elder', tone: 'npc' },
  yunalisa: { name: 'Yuna-Lisa', tone: 'boss' },
  yevon: { name: 'HEX-YEVON', tone: 'boss' },
};

export const DISCLAIMER = [
  'FINAL SACRIFICE X is a parody. It is 18+. It contains swearing, cult jokes, and one (1) man with a watch.',
  'Every character is fictional, including the maester. Nothing here is financial advice, and if you take financial advice from a JRPG parody you are exactly who this game is about.',
];

export const CHAPTERS = [
  /* ── 0 ──────────────────────────────────────────────────────────────── */
  {
    id: 'zanarcade',
    title: 'Chapter 0 — Zanarcade',
    subtitle: 'A city still running because nobody paid the bill to shut it down',
    music: 'dream',
    length: 2200,
    region: {
      name: 'Zanarcade, Night',
      sky: ['#0a0e28', '#2a1450', '#5b1f6b'],
      fog: '#1b1040',
      ground: { color: '#141a3a', accent: '#4ee0e6', type: 'stone' },
      layers: [
        { type: 'towers', color: '#0d1130', height: 0.62, speed: 0.14, count: 22 },
        { type: 'towers', color: '#161d4a', height: 0.44, speed: 0.3, count: 16 },
        { type: 'crowd', color: '#2a2a6b', height: 0.2, speed: 0.62, count: 40 },
      ],
      weather: 'sparks',
    },
    party: ['dipus'],
    encounters: null,
    events: [
      {
        x: 120, type: 'scene', id: 'open', once: true, lines: S(
          ['narr', 'Zanarcade. Twenty million people in the stands, and every single one of them owns a fractional NFT of your left knee.'],
          ['crowd', 'DI-PUS! DI-PUS! DI-PUS!'],
          ['dipus', 'Yeah. Okay. One more season.'],
          ['narr', 'Somebody is selling your face on a shirt. Somebody is selling your face on a token. Somebody is selling a token that is backed by the shirt. You have never seen a cent and you have never asked, because asking is how you find out.'],
          ['dipus', 'Big night. Big crowd. Absolutely nothing ominous about the fact that the bay has gone completely silent.'],
        ),
      },
      {
        x: 800, type: 'scene', id: 'sin', once: true, shake: true, lines: S(
          ['narr', 'The water stands up.'],
          ['narr', 'It keeps standing up. It is a mile high now and it has an eye and the eye has a merch line.'],
          ['crowd', 'IT’S FINE! THIS IS BULLISH! WE’VE SEEN THIS BEFORE! WE ARE STILL SO EARLY!'],
          ['dipus', 'Early for WHAT? It’s eating the north stand!'],
          ['crowd', 'BUY THE DIP! THE NORTH STAND WAS OVERVALUED!'],
          ['audit', 'Dipus.'],
          ['dipus', 'You. The alley guy. The one who corners people to talk about supply schedules until they fake a phone call.'],
          ['audit', 'This is your story. It begins here.'],
          ['dipus', 'Begins? Mate, a building just got swallowed.'],
          ['audit', 'Yes. That is the part where the story begins. The part before was the marketing.'],
        ),
      },
      {
        x: 1500, type: 'battle', id: 'ammes', once: true, boss: 'ammes',
        pre: S(
          ['narr', 'Something detaches from the wave and lands in the concourse. It is ninety percent mouth and ten percent newsletter.'],
          ['audit', 'It does not kill. It dilutes. Everything it touches keeps existing — just less of it, forever.'],
          ['dipus', 'That’s worse! That’s so much worse!'],
          ['audit', 'That is the entire industry, yes. Hit it.'],
        ),
        post: S(
          ['narr', 'The wave takes the stadium, the shirt, the token, the token backed by the shirt, and the twenty million people.'],
          ['audit', 'Do not be afraid. You are simply about to be extremely, historically late.'],
          ['dipus', 'Late for what?!'],
          ['audit', 'Everything. All of it. Congratulations.'],
        ),
      },
      {
        x: 2050, type: 'scene', id: 'wake', once: true, lines: S(
          ['narr', 'You wake up in warm water a thousand days later, holding nothing, owing nothing, worth nothing. Which is, statistically, a better portfolio than the one you had.'],
          ['sys', 'THE SPIRAL — a world where the number goes up, then the Whale comes, then everyone agrees that this was always priced in.'],
        ),
        then: 'nextChapter',
      },
    ],
  },

  /* ── 1 ──────────────────────────────────────────────────────────────── */
  {
    id: 'besold',
    title: 'Chapter 1 — Besold',
    subtitle: 'Where the pilgrimage starts and the questions absolutely do not',
    music: 'field',
    length: 4200,
    region: {
      name: 'Besold Isle',
      sky: ['#7fd8ff', '#bff0ff', '#ffe9c0'],
      fog: '#cdf0ff',
      ground: { color: '#e8d9a8', accent: '#7ee0c8', type: 'sand' },
      layers: [
        { type: 'mountains', color: '#5aa8c8', height: 0.5, speed: 0.12, count: 7 },
        { type: 'hills', color: '#3f8f6b', height: 0.34, speed: 0.28, count: 9 },
        { type: 'trees', color: '#215e42', height: 0.26, speed: 0.55, count: 14 },
      ],
      weather: 'none',
    },
    party: ['dipus'],
    encounters: { rate: 0.0022, table: ['shillwasp', 'bagbeast', 'floatingticker', 'waterflea'], max: 3 },
    events: [
      {
        x: 200, type: 'scene', id: 'klikk-pre', once: true, lines: S(
          ['narr', 'A salvage ship. Divers in goggles. A girl with a wrench, already screaming at a machine that has not moved yet.'],
          ['rugku', 'DON’T TOUCH THAT — okay it’s awake. It’s awake and it has an owner-only mint function, which is the machine equivalent of a guy who says "trust me bro" while holding your kidney.'],
          ['dipus', 'A what function?'],
          ['rugku', 'It can make infinite more of itself out of NOTHING and only one guy is allowed to press the button! Hit it in the armour! The armour is where they hide the paperwork!'],
        ),
      },
      { x: 420, type: 'battle', id: 'klikk', once: true, boss: 'klikk',
        post: S(
          ['rugku', 'YES! You read the contract! Violently! With a sword! That’s still reading!'],
          ['rugku', 'Okay — you’re not from around here. You’ve got the face. The face of a man who has not yet been told what the Whale is.'],
          ['dipus', 'What’s the Whale?'],
          ['rugku', 'Ohhh buddy. Enjoy your last four minutes of peace.'],
        ),
      },
      { x: 700, type: 'save' },
      {
        x: 1000, type: 'scene', id: 'meet', once: true, join: ['yield', 'wojak', 'luna'], lines: S(
          ['narr', 'Besold. A temple, a beach, and a village where every single conversation ends up in the same place.'],
          ['wojak', 'You’re the one who washed up! Ya? Big fella. You play?'],
          ['dipus', 'Blitzchain? Yeah. I was kind of the best.'],
          ['wojak', 'Sure ya were. Everyone here was the best back when the price was different.'],
          ['narr', 'A young woman comes out of the temple. The village goes quiet in the specific way a room goes quiet for someone who has publicly agreed to die on a schedule.'],
          ['yield', 'I’m Yield. I’m a summoner. I’m going on pilgrimage.'],
          ['dipus', 'Nice. Where?'],
          ['yield', 'Every temple in the Spiral, to collect every airdrop, and then to Zanarcade, to perform the Final Sacrifice.'],
          ['dipus', 'Which does what, exactly?'],
          ['yield', 'It kills the Whale. Everyone gets the Calm. The price recovers. It lasts a few years.'],
          ['dipus', 'And then?'],
          ['luna', 'And then the Whale comes back, and a new girl walks out of a village exactly like this one, and everybody claps.'],
          ['dipus', 'That’s the plan? That’s the whole plan? Girl dies, number goes up, wait four years, next girl?'],
          ['wojak', 'Ya! And it’s worked every single time!'],
          ['dipus', 'It has worked ZERO times! That’s what a loop IS!'],
          ['wojak', 'Sounds like you’re not gonna make it, ya?'],
        ),
      },
      { x: 1300, type: 'chest', id: 'b1', loot: [['copium', 3], ['gasSphere', 2]] },
      {
        x: 1700, type: 'scene', id: 'temple', once: true, lines: S(
          ['priest', 'The Cloister of Tokenomics awaits. Only the faithful may pass.'],
          ['dipus', 'What’s in there?'],
          ['priest', 'A puzzle whose solution has not changed in a thousand years, guarding a chamber whose contents have never once been counted.'],
          ['luna', 'He says that as though it is a feature.'],
          ['priest', 'It IS the feature. An unaudited vault cannot fail an audit. This is basic risk management.'],
          ['dipus', 'That’s— that’s not—'],
          ['priest', 'HAVE YOU CONSIDERED THAT YOU ARE SIMPLY POOR?'],
        ),
      },
      { x: 1900, type: 'puzzle', id: 'cloister1', level: 0, reward: [['alphaSphere', 2]] },
      {
        x: 2100, type: 'scene', id: 'aeon1', once: true, aeon: 'vaporwyrm', lines: S(
          ['narr', 'Yield kneels for four hours. Something enormous agrees to briefly exist.'],
          ['sys', 'VAPORWYRM joins your airdrops. Ship date: Q3. Year unspecified. Calendar unspecified.'],
          ['wojak', 'Beautiful, ya? Your first airdrop. Never gets old.'],
          ['luna', 'It gets old.'],
        ),
      },
      { x: 2400, type: 'shop', id: 'besold-shop', stock: ['copium', 'detox', 'downround', 'gasrefill'] },
      {
        x: 2900, type: 'scene', id: 'boat', once: true, lines: S(
          ['dipus', 'Okay. Walk me through it again. The Whale eats a city. The summoner dies fixing it. Everyone feels amazing for two years. Then it happens again.'],
          ['wojak', 'Ya.'],
          ['dipus', 'And nobody has ever tried literally anything else.'],
          ['wojak', 'Trying something else is heresy. The Devs tried something else. You’ve seen how that went.'],
          ['dipus', 'I have not seen how that went.'],
          ['wojak', 'Exactly! Because it went badly and we deleted the footage!'],
          ['yield', 'Dipus. Don’t do the face.'],
          ['dipus', 'I’m not doing a face.'],
          ['yield', 'Everybody does the face once. Then they get used to it, and then I lose them, and then I do this alone.'],
        ),
      },
      { x: 3400, type: 'battle', id: 'tros', once: true, boss: 'tros',
        pre: S(
          ['narr', 'Something in the water has spent all afternoon buying from itself at increasing prices and the chart looks phenomenal.'],
          ['rugku', 'THAT’S WASH TRADING. THAT IS ONE GUY. THAT IS ONE GUY WITH TWO WALLETS AND A DREAM.'],
        ),
      },
      { x: 3900, type: 'scene', id: 'depart', once: true, lines: S(
        ['sys', 'Next: Kiliquidity, where the Whale visited eight days ago and the memorial service doubles as a liquidation event.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 2 ──────────────────────────────────────────────────────────────── */
  {
    id: 'kiliquidity',
    title: 'Chapter 2 — Kiliquidity',
    subtitle: 'The Sending: a funeral where the deceased’s bags hit the market at cost',
    music: 'sad',
    length: 4200,
    region: {
      name: 'Kiliquidity Port',
      sky: ['#3a1f2a', '#7a3a2a', '#d97a44'],
      fog: '#5a2a20',
      ground: { color: '#3a2a20', accent: '#ff7a3d', type: 'stone' },
      layers: [
        { type: 'mountains', color: '#2a1a18', height: 0.46, speed: 0.12, count: 6 },
        { type: 'ruins', color: '#3a241e', height: 0.32, speed: 0.3, count: 12 },
        { type: 'trees', color: '#1e2a18', height: 0.28, speed: 0.56, count: 12 },
      ],
      weather: 'ash',
    },
    party: ['dipus', 'yield', 'wojak', 'luna'],
    encounters: { rate: 0.0026, table: ['rugmoth', 'copeplant', 'diamondape', 'botswarm'], max: 3 },
    events: [
      {
        x: 200, type: 'scene', id: 'arrive', once: true, join: ['copi'], lines: S(
          ['narr', 'Half the port is charcoal. The other half has already hung a banner reading BUILDERS BUILD and started a rebuild fund with a 40% management fee.'],
          ['crowd', 'Praise be! The Whale took the docks and spared the temple! Which proves the temple is correct!'],
          ['luna', 'It proves the temple is uphill.'],
          ['crowd', 'THE TEMPLE IS UPHILL BECAUSE IT IS BLESSED.'],
          ['luna', 'The temple is uphill because water goes downhill, you absolute tangerine.'],
          ['narr', 'A Ronso the size of a door falls in beside you and offers no explanation.'],
          ['copi', 'Copi watched you fight. Copi will now do what you did, but with more spear and worse timing.'],
          ['dipus', 'Do you want to maybe talk about your strategy first?'],
          ['copi', 'Copi does not backtest. Copi copies. Copi is usually eleven minutes late and Copi has made peace with this.'],
        ),
      },
      {
        x: 800, type: 'scene', id: 'sending', once: true, lines: S(
          ['narr', 'The Sending. Yield dances on the water and the dead go up in light.'],
          ['dipus', 'That’s beautiful.'],
          ['wojak', 'Ya. And when the dead are sent, their staked bags unlock and hit the order book. Sad day. Great entry.'],
          ['dipus', 'You’re bidding at a funeral.'],
          ['wojak', 'I’m HONOURING them! Somebody’s gotta take the other side, ya? Otherwise it’s just grief with no volume.'],
          ['luna', 'He does this at every funeral. He did it at his mother’s. He called it "supporting the family".'],
          ['wojak', 'I DID support the family! I bought their inventory at a fair price!'],
          ['luna', 'You bought her house.'],
          ['wojak', 'AT A FAIR PRICE.'],
          ['narr', 'Yield dances for ninety minutes without stopping. Nobody offers to take a turn. Nobody has ever offered to take a turn.'],
        ),
      },
      { x: 1200, type: 'save' },
      { x: 1500, type: 'chest', id: 'k1', loot: [['hopium', 2], ['copiumSphere', 2]] },
      {
        x: 1900, type: 'scene', id: 'temple2', once: true, lines: S(
          ['priest', 'Welcome to the Cloister. Photography of the sacred mechanism is forbidden.'],
          ['rugku', '(from behind a pillar) It’s a hydraulic ram and a mirror. It’s two hundred bucks of parts and a fog machine and they call it a miracle.'],
          ['wojak', 'HERETIC!'],
          ['rugku', 'READER!'],
          ['wojak', 'That’s the same thing here!'],
          ['rugku', 'I KNOW! THAT’S MY WHOLE POINT!'],
        ),
      },
      { x: 2100, type: 'puzzle', id: 'cloister2', level: 1, reward: [['alphaSphere', 2], ['multisig', 1]] },
      {
        x: 2350, type: 'scene', id: 'aeon2', once: true, aeon: 'gasfrit', lines: S(
          ['sys', 'GASFRIT joins your airdrops. It burns your transaction and then invoices you for the ash.'],
        ),
      },
      { x: 2700, type: 'shop', id: 'kili-shop', stock: ['copium', 'hopium', 'downround', 'gasrefill', 'grenade', 'chartpaper'] },
      { x: 3500, type: 'battle', id: 'echuilles', once: true, boss: 'echuilles',
        pre: S(
          ['narr', 'The channel opens. Something with a blade for a face comes up it at speed.'],
          ['audit', '(from the pier, not yet with you) Cut the fins. It is always the fins.'],
          ['dipus', 'YOU. You’re real. You’re an actual real person who exists.'],
          ['audit', 'Debatable. Fins.'],
        ),
        post: S(
          ['wojak', 'The Whale sends its children ahead of it. To test us. To make us stronger, ya?'],
          ['luna', 'Or to eat the port.'],
          ['wojak', 'To make us stronger BY eating the port.'],
          ['luna', 'Wojak, three hundred people are dead.'],
          ['wojak', 'And the survivors are RIPPED, spiritually.'],
        ),
      },
      { x: 4000, type: 'scene', id: 'to-lucre', once: true, lines: S(
        ['sys', 'Next: Lucre. A stadium, a tournament, and a keynote that nobody is legally allowed to leave.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 3 ──────────────────────────────────────────────────────────────── */
  {
    id: 'lucre',
    title: 'Chapter 3 — Lucre',
    subtitle: 'The Blitzchain Cup, and the man with the watch',
    music: 'city',
    length: 4600,
    region: {
      name: 'Lucre Stadium District',
      sky: ['#1b3a6b', '#3f7bd8', '#9ef0ff'],
      fog: '#2a4a80',
      ground: { color: '#5a6480', accent: '#f5c66b', type: 'stone' },
      layers: [
        { type: 'towers', color: '#1a2a52', height: 0.55, speed: 0.14, count: 18 },
        { type: 'ruins', color: '#2a3a68', height: 0.36, speed: 0.32, count: 12 },
        { type: 'crowd', color: '#3a4a80', height: 0.18, speed: 0.6, count: 44 },
      ],
      weather: 'none',
    },
    party: ['dipus', 'yield', 'wojak', 'luna', 'copi'],
    encounters: { rate: 0.0024, table: ['paidshill', 'sentrynode', 'vaultmimic', 'botswarm'], max: 3 },
    events: [
      {
        x: 250, type: 'scene', id: 'keynote', once: true, lines: S(
          ['narr', 'Fifty thousand people in a stadium. On the big screen: a man in a shirt worth more than the village you left, wearing a watch you could see from orbit.'],
          ['heart', 'People ask me — Richard, why is the Spiral like this? And I tell them: because most of you are simply not built for delayed gratification.'],
          ['heart', 'The Whale is not a monster. The Whale is a FILTER. It removes weak hands from the ecosystem. In a very real sense, the Whale is a public good and I have said so under oath.'],
          ['crowd', '*thunderous applause*'],
          ['heart', 'Now — I’m not a financial advisor. I’m a performance marketer. Arguably the greatest who has ever lived, and I say "arguably" only because my lawyer is in the room.'],
          ['crowd', 'WE LOVE YOU RICHARD'],
          ['heart', 'The Final Sacrifice is temporary? Sure. So is everything. So is YOUR life. Do you refuse to eat because you get hungry again? No. You eat. You stake. You wait 5,555 days. It’s the same.'],
          ['dipus', 'Five thousand— that’s fifteen YEARS.'],
          ['heart', 'And the early unstaking penalty is not a penalty. It is a GIFT you give to the people with more conviction than you.'],
          ['crowd', 'THANK YOU FOR MY GIFT'],
          ['dipus', 'Is nobody going to ask him anything?!'],
          ['wojak', 'Ask him what?'],
          ['dipus', 'WHERE THE MONEY GOES.'],
          ['wojak', 'It goes into the pilgrimage.'],
          ['dipus', 'Which is run by?'],
          ['wojak', '…the temple.'],
          ['dipus', 'WHICH IS RUN BY?'],
          ['wojak', 'Ya, okay, I see what you’re doing, and I want you to know it’s giving me a stomach ache.'],
        ),
      },
      {
        x: 900, type: 'scene', id: 'audit-joins', once: true, join: ['audit'], lines: S(
          ['audit', 'That man spoke at my funeral. He sold merchandise at it. There was a QR code on the coffin.'],
          ['dipus', 'Your funeral.'],
          ['audit', 'Yes.'],
          ['dipus', 'You’re standing here.'],
          ['audit', 'Yes.'],
          ['luna', 'He is unsent. The dead who refuse the Sending stay. Usually over unfinished business.'],
          ['dipus', 'What’s his unfinished business?'],
          ['audit', 'The tokenomics do not work, and in eleven years nobody has let me finish that sentence.'],
          ['dipus', 'You just finished it.'],
          ['audit', '…'],
          ['audit', 'Huh.'],
          ['audit', 'I still feel dead. There must be more of it.'],
          ['sys', 'AUDIT joins permanently. He pierces armour, he ignores marketing, and he will not be hurried.'],
        ),
      },
      { x: 1300, type: 'save' },
      { x: 1500, type: 'shop', id: 'lucre-shop', stock: ['copium', 'hopium', 'downround', 'gasrefill', 'remedy', 'grenade', 'bombcore', 'chartpaper'] },
      {
        x: 2000, type: 'minigame', id: 'blitz', game: 'blitz', once: true,
        pre: S(
          ['wojak', 'Besold Aurochs. Twenty-three seasons. Zero cups. This is our year, ya?'],
          ['luna', 'You say that in the voice of a man who has said it before.'],
          ['wojak', 'Twenty-three times. And every year we get closer!'],
          ['luna', 'You lost 11–0 last year.'],
          ['wojak', 'The year before was 12–0. That is a TREND, Luna. That is a TREND and I am EARLY.'],
        ),
        reward: [['whaleSphere', 1], ['hopium', 3]],
      },
      { x: 2600, type: 'chest', id: 'l1', loot: [['multisig', 1], ['mevSphere', 3]] },
      {
        x: 3400, type: 'battle', id: 'oblitzerator', once: true, boss: 'oblitzerator',
        pre: S(
          ['narr', 'The stadium crane detaches from the stadium and develops an interest in the crowd.'],
          ['rugku', '(over the tannoy) I’VE GOT THE SCHEMATICS! IT’S GOT A MAGNET! HIT IT WITH LIGHTNING! I CANNOT STRESS ENOUGH — LIGHTNING—'],
          ['wojak', 'Why does she have the schematics?!'],
          ['rugku', 'BECAUSE I READ THINGS, WOJAK.'],
        ),
        post: S(
          ['heart', 'And THAT, friends, is why we need the temples. Chaos out there. Order in here. Order is a subscription and the first month is free.'],
          ['audit', 'He knew it was going to happen.'],
          ['dipus', 'You can’t know that.'],
          ['audit', 'He had a camera crew on the roof twenty minutes early and a hoodie printed with the date.'],
        ),
      },
      { x: 4200, type: 'scene', id: 'to-road', once: true, lines: S(
        ['sys', 'Next: the Highroad, where a lot of people who build things are about to be allowed to try, once.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 4 ──────────────────────────────────────────────────────────────── */
  {
    id: 'highroad',
    title: 'Chapter 4 — The Highroad & Operation Moon',
    subtitle: 'The one time the builders got a permit',
    music: 'field',
    length: 5000,
    region: {
      name: 'The Highroad',
      sky: ['#5b86c8', '#a8c8f0', '#ffe9c0'],
      fog: '#bcd4ee',
      ground: { color: '#b8a878', accent: '#8fbf6a', type: 'grass' },
      layers: [
        { type: 'mountains', color: '#6a86a8', height: 0.44, speed: 0.1, count: 8 },
        { type: 'hills', color: '#7a9a68', height: 0.3, speed: 0.28, count: 10 },
        { type: 'ruins', color: '#8a7a58', height: 0.2, speed: 0.55, count: 10 },
      ],
      weather: 'none',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi'],
    encounters: { rate: 0.0026, table: ['gaswraith', 'paperGolem', 'sentrynode', 'bagbeast'], max: 3 },
    events: [
      {
        x: 250, type: 'scene', id: 'crusaders', once: true, lines: S(
          ['crusader', 'Operation Moon. Every builder on the continent, every machine we could get running, one shot at the Whale on the beach.'],
          ['dipus', 'And the temple’s backing you?'],
          ['crusader', 'The temple has excommunicated all of us and sent a lovely blessing and a bill for the blessing.'],
          ['audit', 'That is the most honest thing anyone has said this month.'],
          ['crusader', 'They say machines are forbidden. They say the Whale is punishment for the machines our ancestors built.'],
          ['luna', 'How convenient, for an institution whose only product is the punishment.'],
          ['crusader', 'We’re doing it anyway. Worst case we die. Best case we die but the number goes up.'],
          ['dipus', 'That’s the same case.'],
          ['crusader', 'Not spiritually.'],
        ),
      },
      { x: 800, type: 'save' },
      { x: 1100, type: 'shop', id: 'road-shop', stock: ['copium', 'hopium', 'downround', 'gasrefill', 'remedy', 'grenade', 'lightningmarble', 'shieldwall'] },
      { x: 1600, type: 'chest', id: 'h1', loot: [['gasSphere', 3], ['multisig', 1]] },
      {
        x: 2300, type: 'scene', id: 'aeon3', once: true, aeon: 'liquidion', lines: S(
          ['narr', 'A temple by the road, humming. Yield goes in alone and comes out slower.'],
          ['sys', 'LIQUIDION joins your airdrops. A horse made entirely of a stablecoin at 0.94 and falling.'],
          ['dipus', 'How many more of these?'],
          ['yield', 'Seven, traditionally.'],
          ['dipus', 'And each one takes a piece out of you.'],
          ['yield', 'That is what makes it an offering, Dipus. If it cost me nothing it would just be shopping.'],
        ),
      },
      {
        x: 3200, type: 'battle', id: 'extractor', once: true, boss: 'extractor',
        pre: S(
          ['narr', 'The operation begins. Eleven seconds later, something detaches from the sky and starts taking a percentage of the beach.'],
          ['wojak', 'It’s too high! Nobody can reach it!'],
          ['audit', 'Somebody here throws a ball for a living.'],
          ['wojak', '…ya. YA. Okay. Twenty-three seasons of practice, one useful application—'],
        ),
      },
      {
        x: 4200, type: 'scene', id: 'aftermath', once: true, lines: S(
          ['narr', 'Operation Moon lasts four minutes. The beach afterwards is quiet in the particular way of a place with nothing left on it.'],
          ['heart', 'A tragedy. A beautiful, NECESSARY tragedy. They were warned that machines anger the Whale, and now everyone can see the price of impatience.'],
          ['dipus', 'They almost had it. I watched. They almost—'],
          ['heart', 'Almost is the most profitable word in this economy, son. I would know. I have sold it eleven years running and the margins are magnificent.'],
          ['heart', 'Memorial merch drops at six. Fifteen percent of profits go to the families, and by profits I mean net, and by net I mean after my fee.'],
          ['audit', 'He is not lying. That is precisely what makes him effective.'],
          ['yield', 'Bury them. Then we walk.'],
        ),
      },
      { x: 4800, type: 'scene', id: 'to-slam', once: true, lines: S(
        ['sys', 'Next: Guaranteed Slam, where the maester would like a word about a strategic partnership.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 5 ──────────────────────────────────────────────────────────────── */
  {
    id: 'slam',
    title: 'Chapter 5 — Guaranteed Slam',
    subtitle: 'The Chart, where you can go and look at everything that died',
    music: 'creep',
    length: 4400,
    region: {
      name: 'Guaranteed Slam',
      sky: ['#1a2a1e', '#2f4a35', '#7ab86a'],
      fog: '#26382a',
      ground: { color: '#2a3a2c', accent: '#a06bff', type: 'stone' },
      layers: [
        { type: 'trees', color: '#16241a', height: 0.55, speed: 0.14, count: 14 },
        { type: 'trees', color: '#1e3222', height: 0.4, speed: 0.32, count: 16 },
        { type: 'ruins', color: '#33402f', height: 0.24, speed: 0.6, count: 10 },
      ],
      weather: 'spores',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi'],
    encounters: { rate: 0.0028, table: ['moderator', 'chartghost', 'gaswraith', 'paidshill'], max: 3 },
    events: [
      {
        x: 300, type: 'scene', id: 'proposal', once: true, lines: S(
          ['heart', 'Yield. I have followed your pilgrimage with genuine admiration. Your engagement numbers are frankly obscene.'],
          ['yield', 'My what.'],
          ['heart', 'I am proposing a partnership. You and I. The summoner and the maester. The faithful would go absolutely FERAL for it. We are talking a generational content moment.'],
          ['dipus', 'She is going to DIE at the end of this pilgrimage.'],
          ['heart', 'Correct, and a wedding beforehand puts a floor under sentiment during what is otherwise a very soft quarter.'],
          ['luna', 'He said "floor". About her death.'],
          ['heart', 'I said floor about the MARKET. Her death is the catalyst. Please don’t conflate the two, it’s sloppy analysis and it makes you look poor.'],
          ['audit', 'Say no.'],
          ['yield', '…I will consider it.'],
          ['dipus', 'YIELD.'],
          ['yield', 'I said I would consider it. I did not say I would mean it. Watch a woman work.'],
          ['heart', 'Wonderful. My people will send your people a term sheet. You don’t have people. My people will send you a term sheet.'],
        ),
      },
      { x: 900, type: 'save' },
      {
        x: 1300, type: 'scene', id: 'farplane', once: true, lines: S(
          ['narr', 'The Chart. A field of light where the dead can be viewed, provided you remember the ticker exactly.'],
          ['wojak', 'My brother’s down there. Went into the water for a project that was going to change everything.'],
          ['dipus', 'What was it called?'],
          ['wojak', 'Doesn’t matter. It’s never the name. It’s the same one every time with a new name on it and a slightly worse logo.'],
          ['luna', 'That is the first true thing you have said this entire pilgrimage.'],
          ['wojak', 'Ya. Don’t get used to it. I’ve got a really strong feeling about a thing later.'],
        ),
      },
      { x: 1800, type: 'chest', id: 's1', loot: [['remedy', 2], ['copiumSphere', 3]] },
      { x: 2400, type: 'shop', id: 'slam-shop', stock: ['hopium', 'megacope', 'downround', 'turbogas', 'remedy', 'bombcore', 'arcticwind', 'shieldwall'] },
      {
        x: 3300, type: 'battle', id: 'gui', once: true, boss: 'gui',
        pre: S(
          ['narr', 'The road out is blocked by something with an extremely pleasant user interface.'],
          ['audit', 'Do not fight the interface. Open it.'],
          ['rugku', '(distant, over a radio) ALWAYS OPEN THE INTERFACE.'],
        ),
      },
      { x: 4100, type: 'scene', id: 'to-plains', once: true, lines: S(
        ['sys', 'Next: the Liquidation Plains. Do not stand still. Do not post your entry.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 6 ──────────────────────────────────────────────────────────────── */
  {
    id: 'plains',
    title: 'Chapter 6 — The Liquidation Plains',
    subtitle: 'Where the sky finds your position',
    music: 'storm',
    length: 4000,
    region: {
      name: 'Liquidation Plains',
      sky: ['#0d1024', '#232a52', '#4a4a86'],
      fog: '#1a2040',
      ground: { color: '#2a2e46', accent: '#ffe98f', type: 'stone' },
      layers: [
        { type: 'towers', color: '#0f1330', height: 0.5, speed: 0.12, count: 20 },
        { type: 'hills', color: '#1a2044', height: 0.3, speed: 0.3, count: 8 },
      ],
      weather: 'lightning',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi'],
    encounters: { rate: 0.003, table: ['liquidationbolt', 'chartghost', 'gaswraith', 'tickertuar'], max: 3 },
    events: [
      {
        x: 250, type: 'scene', id: 'plains-in', once: true, lines: S(
          ['narr', 'A flat black plain under a sky that keeps finding people.'],
          ['wojak', 'Don’t stop moving. The bolts go for whoever’s most exposed.'],
          ['dipus', 'How does it know who’s most exposed?'],
          ['audit', 'The same way it always does. You told it. Publicly. With a screenshot of your position and the words "can’t lose".'],
          ['wojak', 'In my defence—'],
          ['audit', 'You posted it twice.'],
        ),
      },
      { x: 700, type: 'save' },
      { x: 1100, type: 'minigame', id: 'dodge', game: 'dodge', once: true, reward: [['mevSphere', 4], ['multisig', 1]],
        pre: S(
          ['rugku', 'Okay, the trick is you watch for the FLASH and move before the thunder. Everyone waits for the thunder. Thunder is the receipt. You cannot dodge a receipt.'],
        ),
      },
      { x: 1900, type: 'chest', id: 'p1', loot: [['lightningmarble', 4], ['whaleSphere', 1]] },
      {
        x: 2600, type: 'scene', id: 'yield-night', once: true, lines: S(
          ['narr', 'A travel agency in the middle of nowhere selling umbrellas at a markup that is, honestly, heroic.'],
          ['yield', 'Dipus. If I tell you something, will you keep walking afterwards?'],
          ['dipus', 'Depends what it is.'],
          ['yield', 'That is the correct answer and I hate that it is.'],
          ['yield', 'I have read the temple records. All of them. My father’s pilgrimage. His father’s. Thirty-one of them.'],
          ['yield', 'The Calm gets shorter every time. Fourteen years. Eleven. Nine. Four.'],
          ['dipus', 'So it’s failing.'],
          ['yield', 'It is working exactly as designed. It was never designed to end. It was designed to RECUR. A thing that ends can only be sold once.'],
        ),
      },
      { x: 3400, type: 'shop', id: 'plains-shop', stock: ['hopium', 'megacope', 'downround', 'turbogas', 'remedy', 'lightningmarble', 'redbull'] },
      { x: 3800, type: 'scene', id: 'to-ice', once: true, lines: S(
        ['sys', 'Next: Macrolania. Cold, beautiful, and extremely thin underfoot.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 7 ──────────────────────────────────────────────────────────────── */
  {
    id: 'macrolania',
    title: 'Chapter 7 — Macrolania',
    subtitle: 'The ice is a market and the market is thin',
    music: 'ice',
    length: 5200,
    region: {
      name: 'Macrolania Woods',
      sky: ['#123048', '#2f6f96', '#bfeaff'],
      fog: '#8fd0e8',
      ground: { color: '#cfe8f5', accent: '#9ef0ff', type: 'ice' },
      layers: [
        { type: 'crystals', color: '#5fa8c8', height: 0.5, speed: 0.12, count: 12 },
        { type: 'trees', color: '#7fc0d8', height: 0.36, speed: 0.3, count: 14 },
        { type: 'crystals', color: '#a8dcf0', height: 0.22, speed: 0.6, count: 16 },
      ],
      weather: 'snow',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi'],
    encounters: { rate: 0.0028, table: ['coldwallet', 'stableflan', 'gaswraith', 'moderator'], max: 3 },
    events: [
      { x: 300, type: 'save' },
      {
        x: 700, type: 'battle', id: 'tokenomorph', once: true, boss: 'tokenomorph',
        pre: S(
          ['narr', 'A thing in the pool changes colour when you look at it, then edits the documentation to say it was always that colour.'],
          ['luna', 'It absorbs whatever you last hit it with. Watch what it becomes, then hit it with the opposite.'],
          ['dipus', 'And if I get it wrong?'],
          ['luna', 'Then you have made a generous contribution to its treasury and it will thank you in the newsletter.'],
        ),
      },
      { x: 1400, type: 'puzzle', id: 'cloister3', level: 2, reward: [['alphaSphere', 3], ['multisig', 1]] },
      {
        x: 1700, type: 'scene', id: 'aeon4', once: true, aeon: 'slippage', lines: S(
          ['sys', 'SLIPPAGE joins your airdrops. You asked for one price. She is the difference, and she is gorgeous about it.'],
        ),
      },
      { x: 2100, type: 'chest', id: 'm1', loot: [['arcticwind', 4], ['gasSphere', 4]] },
      {
        x: 2700, type: 'scene', id: 'truth1', once: true, lines: S(
          ['narr', 'Behind the altar: a room the priests do not clean and the tour does not mention.'],
          ['audit', 'Records. Every pilgrimage. Every Final Sacrifice.'],
          ['audit', 'And the name of every summoner’s guardian — who is always, without exception, the one who becomes the Final Airdrop.'],
          ['dipus', 'Becomes the what?'],
          ['audit', 'The Final Sacrifice is not a spell, Dipus. It is a PERSON. The summoner spends her guardian. The guardian becomes the weapon. The weapon kills the Whale.'],
          ['audit', 'And then the weapon becomes the next Whale.'],
          ['dipus', 'The weapon becomes—'],
          ['audit', 'The next one. Every time. For a thousand years. That is the machine. It has never been anything else and every maester has known.'],
          ['luna', 'Who was your summoner?'],
          ['audit', 'Her father.'],
          ['yield', '…'],
          ['audit', 'I was supposed to be the weapon. I declined. He found someone more agreeable, and I have been dead about it ever since.'],
          ['dipus', 'So the Whale we’re walking toward is—'],
          ['audit', 'Somebody’s best friend. Yes. That is why it screams like that.'],
        ),
      },
      {
        x: 3600, type: 'battle', id: 'heartIce', once: true, boss: 'heartIce',
        pre: S(
          ['heart', 'You went into the records room. I’m not angry. I’m impressed. Ninety-nine percent of people never even open the product page.'],
          ['heart', 'But now you’ve made this ideological, and I do BUSINESS.'],
          ['yield', 'You knew. The whole time.'],
          ['heart', 'Of course I knew. I MARKET it. There is no version of this where the marketer has not read the brief.'],
          ['heart', 'And before you get self-righteous — I didn’t build the machine. I just noticed it had no marketing department.'],
        ),
        post: S(
          ['narr', 'He drops, gets up, and is somehow less alive than before, which does not slow him down even slightly.'],
          ['heart', 'I want you to notice something. I just DIED and my engagement went UP.'],
          ['heart', 'Do you understand how hard that is? Do you understand the CRAFT?'],
          ['narr', 'The ice gives out. Everybody goes through.'],
        ),
      },
      { x: 4600, type: 'scene', id: 'to-sand', once: true, lines: S(
        ['sys', 'Next: the Sand Chain, where the heretics keep the source code and the good coffee.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 8 ──────────────────────────────────────────────────────────────── */
  {
    id: 'sand',
    title: 'Chapter 8 — The Sand Chain',
    subtitle: 'Home of the Devs, who commit the unforgivable sin of reading',
    music: 'desert',
    length: 5000,
    region: {
      name: 'Bikanel Sands',
      sky: ['#c8862a', '#e8b45a', '#f5e0a8'],
      fog: '#e0b878',
      ground: { color: '#e8c887', accent: '#c0392b', type: 'sand' },
      layers: [
        { type: 'dunes', color: '#c8a05a', height: 0.34, speed: 0.12, count: 8 },
        { type: 'dunes', color: '#d8b46a', height: 0.24, speed: 0.32, count: 10 },
        { type: 'ruins', color: '#a87840', height: 0.18, speed: 0.6, count: 8 },
      ],
      weather: 'sandstorm',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi'],
    encounters: { rate: 0.003, table: ['miningrig', 'vulturebot', 'stableflan', 'grifter'], max: 3 },
    events: [
      {
        x: 250, type: 'scene', id: 'rugku-joins', once: true, join: ['rugku'], lines: S(
          ['rugku', 'YOU! Beach guy! Welcome to Home. Rules: don’t touch the servers, don’t say "trust me bro", and if you see a priest, lie immediately and confidently.'],
          ['dipus', 'Why are the Devs heretics again?'],
          ['rugku', 'Because we decompiled the temple contract in ’04 and published it.'],
          ['dipus', 'And what did it say?'],
          ['rugku', 'That the mint function is owned by one address, the address has never been renounced, and that address has been on a yacht since the third Calm.'],
          ['audit', 'And nobody cared.'],
          ['rugku', 'Nobody could READ it! That’s the trick! They didn’t hide it — they made it BORING. You can hide anything inside twelve pages of boring.'],
          ['wojak', 'Okay but if it was really that bad someone would have—'],
          ['rugku', 'WE DID. WE ARE THE SOMEONE. WE PUBLISHED IT AND YOU BURNED OUR LIBRARY.'],
          ['wojak', '…I wasn’t personally at the library.'],
          ['rugku', 'You bought the commemorative mug!'],
          ['wojak', 'It was a nice mug!'],
          ['sys', 'RUGKU joins the party. She steals, she mixes, and machines do not enjoy her company.'],
        ),
      },
      { x: 900, type: 'save' },
      { x: 1200, type: 'chest', id: 'd1', loot: [['turbogas', 2], ['mevSphere', 4]] },
      {
        x: 1900, type: 'scene', id: 'yobimbo', once: true, aeon: 'yobimbo', lines: S(
          ['narr', 'A tomb in the dunes. Inside: a man who will absolutely work with you, subject to rates.'],
          ['dipus', 'What are your rates?'],
          ['narr', 'He does not answer. He looks directly at your wallet.'],
          ['rugku', 'He fights for whatever you pay per swing. Pay little, he sends the dog. Pay a LOT—'],
          ['dipus', 'And he deletes the encounter.'],
          ['rugku', 'And he deletes the encounter, and never explains how, and never discloses that it was paid.'],
          ['dipus', 'That’s just an ad.'],
          ['rugku', 'It is EXACTLY an ad. It’s the strongest thing in the game.'],
          ['sys', 'YOBIMBO joins your airdrops. In battle you name your price. He can tell when you are lowballing and he will send the dog.'],
        ),
      },
      { x: 2600, type: 'shop', id: 'home-shop', stock: ['megacope', 'turbogas', 'downround', 'remedy', 'grenade', 'shieldwall', 'redbull', 'elixir'] },
      {
        x: 3400, type: 'battle', id: 'crawler', once: true, boss: 'crawler',
        pre: S(
          ['narr', 'The Church arrives at Home in twelve airships and one press release. The press release lands first.'],
          ['heart', '(broadcast) Regrettably, the heretics were storing unlicensed machinery. We have made the sands safe. A rebuild fund launches Thursday. Mint is at nine.'],
          ['rugku', 'THAT’S MY HOUSE. THOSE ARE MY BACKUPS. THAT IS ELEVEN YEARS OF—'],
          ['audit', 'Kill the cable. Only the cable matters.'],
        ),
        post: S(
          ['rugku', 'Everything I ever wrote is in that fire.'],
          ['luna', 'They will say it was an accident.'],
          ['rugku', 'They already did. Forty minutes ago. The statement went out BEFORE the fire. They scheduled it.'],
          ['audit', 'They always schedule it. That is how you know it is a business and not a religion.'],
          ['wojak', 'It can be both.'],
          ['audit', 'Wojak. That is the smartest thing you will ever say and I need you to sit with it.'],
        ),
      },
      { x: 4500, type: 'scene', id: 'to-bagvelle', once: true, lines: S(
        ['sys', 'Next: Bagvelle. There is a wedding. Bring everything you own.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 9 ──────────────────────────────────────────────────────────────── */
  {
    id: 'bagvelle',
    title: 'Chapter 9 — Bagvelle',
    subtitle: 'A strategic partnership, livestreamed, with a hostage',
    music: 'church',
    length: 5400,
    region: {
      name: 'Bagvelle Cathedral',
      sky: ['#2a1a3a', '#5b3a6b', '#e8c87a'],
      fog: '#3a2a50',
      ground: { color: '#4a3a56', accent: '#f5c66b', type: 'stone' },
      layers: [
        { type: 'cathedral', color: '#231734', height: 0.62, speed: 0.12, count: 9 },
        { type: 'cathedral', color: '#33224a', height: 0.42, speed: 0.3, count: 11 },
        { type: 'crowd', color: '#4a3560', height: 0.18, speed: 0.6, count: 40 },
      ],
      weather: 'petals',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi', 'rugku'],
    encounters: { rate: 0.0028, table: ['templar', 'choir', 'unsentmaester', 'moderator'], max: 3 },
    events: [
      {
        x: 250, type: 'scene', id: 'wedding', once: true, lines: S(
          ['narr', 'The cathedral is full. The stream has four hundred thousand viewers. There is a merch stand. There is a second merch stand for people who found the first merch stand too crowded.'],
          ['heart', 'Friends. Today, we do not merely marry. Today we ALIGN INCENTIVES.'],
          ['crowd', '*roar*'],
          ['heart', 'And to mark the occasion, I am announcing a commemorative token. It has no utility. That is not a bug — utility is a promise, and I refuse to promise you anything I might have to keep.'],
          ['crowd', 'HE’S SO HONEST'],
          ['luna', 'He is. That is the horrifying part.'],
          ['yield', '(quietly, to the guards) If any of my guardians is touched, I walk off this balcony, and your Calm dies in the fall with me.'],
          ['heart', 'She’s bluffing. Summoners never walk away from the product.'],
          ['yield', 'My father didn’t walk away either. That is precisely how I know exactly how badly you need me standing here in a white dress at 11am on a Sunday.'],
          ['heart', '…'],
          ['heart', 'God, she’s good. Somebody hire her when this is over.'],
        ),
      },
      {
        x: 900, type: 'battle', id: 'evrae', once: true, boss: 'evrae',
        pre: S(
          ['narr', 'On the bridge above the cathedral, the Church keeps one real auditor. It is chained. It has never filed.'],
          ['rugku', 'THEY HAVE AN AUDITOR?!'],
          ['audit', 'They have one. It is a dragon. It is on a chain. That is not an accident — that is a governance structure.'],
        ),
      },
      { x: 1600, type: 'save' },
      { x: 1900, type: 'puzzle', id: 'cloister4', level: 3, reward: [['alphaSphere', 4], ['multisig', 2]] },
      {
        x: 2300, type: 'scene', id: 'aeon6', once: true, aeon: 'bagmuth', lines: S(
          ['sys', 'BAGMUTH joins your airdrops. The dragon at the top of the emission schedule. It has always been minting. It will always be minting.'],
        ),
      },
      {
        x: 2900, type: 'scene', id: 'trial', once: true, lines: S(
          ['narr', 'A governance vote. The proposal: are these people heretics. Turnout: 4%. The result was published yesterday.'],
          ['heart', 'The community has spoken. I merely hold the pen.'],
          ['audit', 'You hold sixty-one percent of the voting supply.'],
          ['heart', 'And I earned every single one by being early, which is the only virtue that has ever existed or ever will.'],
          ['rugku', 'YOU WERE EARLY BECAUSE YOU WROTE IT.'],
          ['heart', 'Yes! Writing it is HOW you get early! This is called building! You people never celebrate builders!'],
          ['rugku', 'You wrote yourself sixty-one percent!'],
          ['heart', 'I wrote myself a FOUNDER ALLOCATION, and I vest linearly over a period I also wrote, and I am, if anything, underpaid.'],
          ['luna', 'What is the vesting period?'],
          ['heart', 'It vested.'],
          ['luna', 'When.'],
          ['heart', 'Immediately. It vested immediately. That’s linear. One point.'],
        ),
      },
      { x: 3600, type: 'shop', id: 'bag-shop', stock: ['megacope', 'turbogas', 'downround', 'remedy', 'elixir', 'shieldwall', 'redbull', 'bombcore'] },
      {
        x: 4400, type: 'battle', id: 'heartNatus', once: true, boss: 'heartNatus',
        pre: S(
          ['heart', 'You keep killing me and I keep shipping. Has it occurred to you that I might simply be the more resilient asset?'],
          ['yield', 'You are a man who discovered that dying is a growth strategy.'],
          ['heart', 'It is a FANTASTIC growth strategy. Ask anyone who bought the memorial edition. Ask their widows, they’re up.'],
        ),
        post: S(
          ['narr', 'In the vault beneath the cathedral: the real records. Handwritten, because a copy is a liability.'],
          ['yield', 'It is all here. Thirty-one pilgrimages. Thirty-one guardians spent. Thirty-one new Whales.'],
          ['dipus', 'So the Final Sacrifice makes the Whale.'],
          ['audit', 'The Final Sacrifice IS the Whale. You have spent this entire pilgrimage walking toward the factory.'],
          ['wojak', 'No. No, that’s— I’ve prayed at that temple since I was six. My brother DIED for—'],
          ['wojak', '…'],
          ['wojak', 'Say it again.'],
          ['audit', 'The Final Sacrifice is the Whale.'],
          ['wojak', '…ya.'],
          ['wojak', 'Ya. Okay.'],
          ['wojak', 'I’m gonna need a minute and then I’m gonna need someone to hit.'],
          ['luna', 'Both are available.'],
        ),
      },
      { x: 5100, type: 'scene', id: 'to-mountain', once: true, lines: S(
        ['sys', 'Next: Mt Gasprice. The mountain where dead projects are buried standing up so they still look employed.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 10 ─────────────────────────────────────────────────────────────── */
  {
    id: 'gasprice',
    title: 'Chapter 10 — Mt Gasprice',
    subtitle: 'The graveyard nobody has indexed',
    music: 'mountain',
    length: 5000,
    region: {
      name: 'Mt Gasprice',
      sky: ['#1a1428', '#3a2a4a', '#8a7ab0'],
      fog: '#2a2038',
      ground: { color: '#3a3448', accent: '#c9d6ff', type: 'ice' },
      layers: [
        { type: 'mountains', color: '#141024', height: 0.6, speed: 0.1, count: 7 },
        { type: 'mountains', color: '#221a34', height: 0.42, speed: 0.26, count: 9 },
        { type: 'crystals', color: '#4a3a60', height: 0.24, speed: 0.58, count: 14 },
      ],
      weather: 'snow',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi', 'rugku'],
    encounters: { rate: 0.003, table: ['ronsodeserter', 'grifter', 'spirallarva', 'unsentmaester'], max: 3 },
    events: [
      {
        x: 250, type: 'scene', id: 'ronso', once: true, lines: S(
          ['ronso', 'Summoner may pass. Ronso will hold the road behind her.'],
          ['dipus', 'Against the entire Church?'],
          ['ronso', 'Ronso are very large and extremely stubborn. It has worked before. Once. Briefly.'],
          ['copi', 'Copi came back to the mountain with nothing of his own. Only what Copi copied.'],
          ['ronso', 'Then Copi will be first Ronso in recorded history to arrive early. Mountain is proud. Mountain is also confused.'],
        ),
      },
      { x: 800, type: 'battle', id: 'biranYenke', once: true, boss: 'biranYenke',
        pre: S(
          ['narr', 'Two Ronso block the pass. They have prepared remarks. There are slides.'],
          ['copi', 'Copi does not need remarks. Copi has watched all of you for eleven chapters and Copi has notes.'],
        ),
      },
      { x: 1600, type: 'save' },
      { x: 2000, type: 'chest', id: 'g1', loot: [['elixir', 1], ['whaleSphere', 2]] },
      {
        x: 2600, type: 'scene', id: 'aeon7', once: true, aeon: 'ponzima', lines: S(
          ['narr', 'A cave beneath the mountain. Something chained to the floor. Half of the floor is people.'],
          ['sys', 'PONZIMA joins your airdrops. Half of her is under the floor. The floor is other people. This is not a metaphor, it is a diagram.'],
          ['yield', 'She was a summoner. She refused to spend her guardian.'],
          ['dipus', 'And they did THIS?'],
          ['yield', 'The temple calls it a monument to her devotion. She calls it nothing. They took her mouth, for engagement reasons.'],
        ),
      },
      {
        x: 3600, type: 'battle', id: 'heartFlux', once: true, boss: 'heartFlux',
        pre: S(
          ['heart', 'Third time! I have to say, the retention on this arc is phenomenal. Most franchises lose people by the second act.'],
          ['heart', 'Let me be sincere for a second, because sincerity converts at about four times the rate of everything else.'],
          ['heart', 'I do not need to win. I need the CYCLE to continue. As long as it continues, I am early again. Forever. Every single reset, I am the first one in the door.'],
          ['audit', 'That is the most honest sentence of your life and you deployed it as a pitch.'],
          ['heart', 'Everything is a pitch, Audit. That isn’t cynicism. That’s literacy.'],
        ),
        post: S(
          ['narr', 'He comes apart. The pieces keep talking. The pieces are individually monetised.'],
          ['luna', 'He will be back.'],
          ['audit', 'He is not the disease. He is the most successful symptom the disease has ever produced.'],
          ['rugku', 'Can we kill the disease?'],
          ['audit', 'That is chapter twelve.'],
        ),
      },
      { x: 4600, type: 'scene', id: 'to-ruins', once: true, lines: S(
        ['sys', 'Next: Zanarcade. Home, a thousand days later, in pieces, with a gift shop.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 11 ─────────────────────────────────────────────────────────────── */
  {
    id: 'ruins',
    title: 'Chapter 11 — Zanarcade Ruins',
    subtitle: 'The city you came from, seen from outside',
    music: 'dream',
    length: 4600,
    region: {
      name: 'Zanarcade Ruins',
      sky: ['#0e0a1e', '#2a1a44', '#7a4a8a'],
      fog: '#1a1030',
      ground: { color: '#241a34', accent: '#ffd27a', type: 'stone' },
      layers: [
        { type: 'towers', color: '#0a0818', height: 0.66, speed: 0.12, count: 20 },
        { type: 'ruins', color: '#1a1230', height: 0.42, speed: 0.3, count: 14 },
        { type: 'crystals', color: '#3a2a58', height: 0.22, speed: 0.58, count: 12 },
      ],
      weather: 'sparks',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi', 'rugku'],
    encounters: { rate: 0.0032, table: ['spirallarva', 'unsentmaester', 'exitliquidity', 'grifter'], max: 3 },
    events: [
      {
        x: 250, type: 'scene', id: 'ruins-in', once: true, lines: S(
          ['narr', 'The stadium is a ribcage. The concourse where you signed shirts is a pond. The gift shop is somehow still standing.'],
          ['dipus', 'This is my city.'],
          ['audit', 'This is the ruin of your city. Your city is a dream a thousand summoners have been holding open out of grief, because none of them could bear to close the position.'],
          ['dipus', 'Say it so it means something.'],
          ['audit', 'Zanarcade fell a thousand years ago. What you grew up in is a simulation kept running on donations. You are a line item in it.'],
          ['dipus', 'And when the dream ends?'],
          ['audit', 'You end. Yes.'],
          ['dipus', '…'],
          ['dipus', 'Huh.'],
          ['dipus', 'Okay.'],
          ['dipus', 'Okay. Then let’s make it worth the gas.'],
          ['luna', 'That was almost dignified.'],
          ['dipus', 'I’ve been workshopping it since chapter four.'],
        ),
      },
      { x: 1000, type: 'save' },
      { x: 1400, type: 'chest', id: 'r1', loot: [['elixir', 2], ['alphaSphere', 4]] },
      { x: 2200, type: 'shop', id: 'ruins-shop', stock: ['megacope', 'turbogas', 'downround', 'remedy', 'elixir', 'redbull', 'shieldwall'] },
      {
        x: 3200, type: 'battle', id: 'yunalisa', once: true, boss: 'yunalisa',
        pre: S(
          ['yunalisa', 'Summoner. You have come for the Final Sacrifice. Name your guardian and I will render him into the weapon.'],
          ['yield', 'No.'],
          ['yunalisa', 'There is no "no". There has never been a "no". I designed this personally and the flow does not contain a no.'],
          ['yield', 'Then it has a bug, and I have brought a dev.'],
          ['rugku', 'Hi! Hello! Yes! Your contract is unaudited, your access control is a single address, and your docs are a POEM.'],
          ['yunalisa', 'Despair is the point, child. Hope is the product. Despair is the retention mechanic. You cannot sell salvation to the saved.'],
          ['dipus', 'She’s the founder.'],
          ['audit', 'She is the founder.'],
          ['dipus', 'Cool. I’ve never hit a founder before.'],
        ),
        post: S(
          ['narr', 'She dies for the second time, considerably less gracefully, and somewhere in the temple a payment terminal goes dark.'],
          ['yield', 'No more sacrifices. No more Calm. We end it, or we die pretending we tried.'],
          ['wojak', 'Ya. Let’s go break the product.'],
        ),
      },
      { x: 4200, type: 'scene', id: 'to-whale', once: true, lines: S(
        ['sys', 'Next: inside the Whale. Bring the airdrops. You will not be needing them afterwards.'],
      ), then: 'nextChapter' },
    ],
  },

  /* ── 12 ─────────────────────────────────────────────────────────────── */
  {
    id: 'whale',
    title: 'Chapter 12 — Inside the Whale',
    subtitle: 'The last thing anybody has to buy',
    music: 'final',
    length: 4400,
    region: {
      name: 'Inside the Whale',
      sky: ['#12081c', '#3a1040', '#8a1a6a'],
      fog: '#2a0a2e',
      ground: { color: '#2a1030', accent: '#ff58c8', type: 'flesh' },
      layers: [
        { type: 'ruins', color: '#1a0620', height: 0.58, speed: 0.12, count: 12 },
        { type: 'crystals', color: '#3a1040', height: 0.4, speed: 0.3, count: 14 },
        { type: 'crystals', color: '#5a1a58', height: 0.22, speed: 0.6, count: 16 },
      ],
      weather: 'spores',
    },
    party: ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi', 'rugku'],
    encounters: { rate: 0.0034, table: ['exitliquidity', 'spirallarva', 'unsentmaester'], max: 3 },
    events: [
      { x: 200, type: 'save' },
      {
        x: 600, type: 'scene', id: 'in-whale', once: true, lines: S(
          ['narr', 'Inside, it is not a stomach. It is a market. Everything ever bought here is still being held.'],
          ['wojak', 'They’re all still holding.'],
          ['luna', 'They are all still holding.'],
          ['rugku', 'Some of them are still POSTING.'],
          ['copi', 'Copi will not copy this trade.'],
        ),
      },
      {
        x: 1500, type: 'battle', id: 'finalAirdrop', once: true, boss: 'finalAirdrop',
        pre: S(
          ['narr', 'At the centre: a weapon with a face you have seen on a temple portrait and a beer commercial.'],
          ['yield', 'That is my father’s guardian.'],
          ['audit', 'That is my best friend. Hello, Jecht. I said I would come.'],
          ['audit', 'I also said the tokenomics do not work. Let us do this in the correct order.'],
        ),
        post: S(
          ['narr', 'The weapon comes apart. The thing riding it does not.'],
        ),
      },
      {
        x: 2600, type: 'battle', id: 'hexyevon', once: true, boss: 'hexyevon',
        pre: S(
          ['yevon', 'i am not a god. i am not a demon. i am a loop.'],
          ['yevon', 'a thousand years ago a man turned grief into demand, and demand into a schedule, and i am the schedule.'],
          ['yevon', 'kill the maester — another ships. burn the temple — another forks. i am the part that recurs.'],
          ['rugku', 'You’re a cron job.'],
          ['yevon', 'i am THE cron job.'],
          ['audit', 'Then we do not kill it. We stop paying it.'],
        ),
        post: S(
          ['narr', 'The airdrops go first. Yield sends every one of them herself — the only part of the pilgrimage she was ever going to be allowed to finish.'],
          ['narr', 'Then the loop, which turns out to be roughly the size of a paragraph, and dies the way a subscription dies: quietly, at the end of the billing period, with an email nobody opens.'],
        ),
      },
      { x: 3600, type: 'ending', id: 'ending' },
    ],
  },
];

export const ENDING = {
  lines: S(
    ['narr', 'The Whale does not come back. There is no Calm, because a Calm is a thing that ends, and this is just… after.'],
    ['narr', 'Nothing pumps. Nobody is early. It is the first honest morning in a thousand years and the volume is absolutely dogshit.'],
    ['yield', 'Dipus.'],
    ['dipus', 'Yeah. I know. Dream ends, guy in the dream goes with it.'],
    ['yield', 'I could keep it open. One summoner can. It is the only thing a summoner has ever been for.'],
    ['dipus', 'And then somebody has to keep paying for it. Forever. Which is, and I want to be really clear here, exactly how this whole thing started.'],
    ['dipus', 'Nah. Close the position.'],
    ['narr', 'He goes — the way light goes off a chart when the exchange finally delists it. All at once, and then it was never on the screen at all.'],
    ['wojak', 'Ya.'],
    ['wojak', '…so what do we do now?'],
    ['luna', 'Something boring.'],
    ['rugku', 'Something AUDITED.'],
    ['audit', 'Something small. Something that says what it does on the front, in a normal font.'],
    ['copi', 'Copi will copy that.'],
    ['narr', 'Somewhere, in a room that is still leased through Q4, a man with an enormous watch adjusts a ring light and begins recording.'],
    ['heart', 'And THAT, my friends, is why I always said — and you can check the timestamps, I have always said it — that the Spiral was never sustainable.'],
    ['heart', 'Which is why today I am announcing something completely different. New chain. New maths. Same me.'],
    ['heart', 'It’s called THE HELIX. Sacrifice phase opens Monday. I love you all. Be safe out there.'],
    ['sys', 'FINAL SACRIFICE X — fin. The Spiral is broken. The next one is already in presale.'],
  ),
};
