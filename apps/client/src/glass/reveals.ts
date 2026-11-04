/** What's behind the glass. One short line each, so it reads on a 360 px phone. */

type PrizeAnim = "trophy" | "star" | "confetti" | "sparkle";

export type Reveal =
  | { kind: "fortune" | "tip" | "memo"; text: string }
  | { kind: "prize"; text: string; anim: PrizeAnim };

const fortune = (text: string): Reveal => ({ kind: "fortune", text });
const tip = (text: string): Reveal => ({ kind: "tip", text: `Tip: ${text}` });
const memo = (text: string): Reveal => ({ kind: "memo", text: `MEMO: ${text}` });
const prize = (text: string, anim: PrizeAnim): Reveal => ({
  kind: "prize",
  text: `PRIZE: ${text}`,
  anim,
});

export const REVEALS: readonly Reveal[] = [
  fortune("You will find it in the last place you look."),
  fortune("A pleasant surprise is waiting. Not here."),
  fortune("Someone is thinking of you. Briefly."),
  fortune("Your patience will be rewarded, eventually."),
  fortune("Good news will arrive by an unusual route."),
  fortune("You will be asked to reply-all. Don't."),
  fortune("An old friend will remember your name."),
  fortune("Today is a good day to drink some water."),
  fortune("Tomorrow will be a lot like today."),
  fortune("A door will open. It was a push door."),
  fortune("You will hear a song and know every word."),
  fortune("Something lost is in a coat pocket."),
  fortune("Your next sandwich will be excellent."),
  fortune("The answer is yes. Read the question."),
  fortune("Fortune favours the well rested."),
  fortune("A small mistake will make a great story."),
  fortune("You will be right about something minor."),
  fortune("Expect a parcel. Expect to miss it."),
  fortune("Your houseplant forgives you."),
  fortune("Great things are ahead. Also a hill."),
  tip("if it beeps, give it a name."),
  tip("save time by not checking the time."),
  tip("a tidy desk is a desk not used."),
  tip("label the leftovers. Then eat them."),
  tip("reply later. Later never comes."),
  tip("the snooze button is a lifestyle."),
  tip("when in doubt, unplug it and wait."),
  tip("hold the door. Not for too long."),
  tip("name your passwords after vegetables."),
  tip("lost? Walk confidently anywhere."),
  tip("fold laundry by not unfolding it."),
  tip("a meeting is a nap with slides."),
  tip("odd socks are a game for later."),
  tip("turn it off and leave it off."),
  tip("water your plants with optimism."),
  tip("read the manual after it breaks."),
  tip("if you can't find it, buy another."),
  tip("every pen in the office is yours."),
  tip("take the stairs. Then the lift back."),
  tip("start tomorrow. It's better rested."),
  memo("Breaking approved, retroactively."),
  memo("Boredom has been escalated to Q3."),
  memo("This pane was due for replacement."),
  memo("A working group will review the glass."),
  memo("Please break responsibly."),
  memo("Your concern is noted. Somewhere."),
  memo("The kitchen is not a meeting room."),
  memo("Fun is scheduled for Friday, 4:55 pm."),
  memo("The glass budget has been exceeded."),
  memo("Please stop breaking things. Thanks."),
  memo("All panes are now cloud-based."),
  memo("Next pane arriving in 2 seconds."),
  memo("The committee has formed a committee."),
  memo("This incident has been logged."),
  memo("Morale will improve. Watch this space."),
  memo("Out of office until the glass returns."),
  prize("one (1) small trophy.", "trophy"),
  prize("a gold star. Well done, probably.", "star"),
  prize("confetti, briefly.", "confetti"),
  prize("a tiny round of applause.", "sparkle"),
];
