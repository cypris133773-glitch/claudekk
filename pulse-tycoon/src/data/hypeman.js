// The figurehead. A cartoon in sunglasses who reacts to what you just did.
//
// This is parody: an exaggerated send-up of crypto-founder livestream patter,
// not a portrayal of anything anyone actually said or did. The game says so
// on the About panel too, in larger letters.

export const HYPE_NAME = 'RICHARD HEART';
export const HYPE_TAG = 'parody';

// Lines are bucketed by what just happened. Anything without a bucket falls
// back to 'idle', which is most of the run.
export const LINES = {
  idle: [
    'The chart is down. Time is a chart. Zoom out until it is up.',
    'I am not saying it outperforms everything. I am reading it aloud, slowly.',
    'Nine hours in and we have not left the first slide. This is the value.',
    'Some people call it a scheme. Those people do not have a showroom.',
    'Do your own research. Then do mine. Mine is better.',
    'The only bad time to buy was every time you did not.',
    'I have been early since before there was anything to be early to.',
    'Volatility is just enthusiasm with a direction.',
    'Everyone who sold is now someone who sold. Sit with that.',
    'This is not financial advice. It is financial atmosphere.',
  ],
  tap: [
    'Yes. Again. The finger is a yield strategy.',
    'Manual labour. Very authentic. Very grassroots.',
    'Each tap is a tiny act of conviction. Twelve thousand more.',
  ],
  advisor: [
    'Delegation. The final form of belief.',
    'Now you sleep and the number still moves. That is freedom, technically.',
    'Payroll is just staking, but the shares complain.',
  ],
  stake: [
    'Locked. Nothing can go wrong for exactly that long.',
    'Longer pays better. Bigger pays better. Asking pays nothing.',
    'You have chosen to not touch it. That is the hardest upgrade in the game.',
  ],
  restake: [
    'We burn the empire and keep the lesson. Mostly the lesson.',
    'Everything resets except the part where I was right.',
    'Sacrifice. You get nothing back. You get everything back. Both.',
  ],
  pump: [
    'THERE IT IS. Screenshot it. Screenshot it now.',
    'Green. Briefly. Aggressively. Take what you can.',
    'This is organic. Completely organic. Do not check.',
  ],
  milestone: [
    'A milestone. Frame it. Sell prints of it.',
    'Twenty-five of anything is a movement.',
  ],
};

export function pickLine(bucket, rand = Math.random) {
  const pool = LINES[bucket] || LINES.idle;
  return pool[Math.floor(rand() * pool.length)];
}
