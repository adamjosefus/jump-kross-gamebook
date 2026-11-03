/** iPhones have no Vibration API, but Safari gives a light tap when a switch is toggled. */
const tapBySwitch = () => {
  const label = document.createElement('label');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.append(input);
  document.body.append(label);
  label.click();
  label.remove();
};

const canVibrate = () => 'vibrate' in navigator;

/** A small click, e.g. when a finger takes hold of a control. */
export const hapticLight = () => {
  if (canVibrate()) navigator.vibrate(10);
  else tapBySwitch();
};

/** A distinct click, e.g. when an action is done. A switch taps only lightly, so it taps twice. */
export const hapticStrong = () => {
  if (canVibrate()) {
    navigator.vibrate(40);
    return;
  }
  tapBySwitch();
  setTimeout(tapBySwitch, 80);
};
