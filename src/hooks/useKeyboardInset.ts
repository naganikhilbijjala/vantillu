import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * How much of the screen the soft keyboard is covering, in points. 0 when it is down.
 *
 * **`KeyboardAvoidingView` has nothing to work with on Android any more.** Edge-to-edge is
 * mandatory from Android 16, and Expo SDK 57 removed the opt-out — `edgeToEdgeEnabled` in
 * `app.json` now only produces a warning. An edge-to-edge window does not resize when the
 * keyboard opens, so `windowSoftInputMode="adjustResize"` is inert and a screen that trusted
 * it puts its last field under the keyboard with no way to see what you are typing.
 *
 * React Native still reports the keyboard itself. `ReactRootView.checkForKeyboardEvents`
 * derives these events from `WindowInsetsCompat.Type.ime()` and subtracts the system bars,
 * which does not depend on the window having resized — so the height is trustworthy on both
 * platforms, and what has to move into JS is only the response to it.
 *
 * `keyboardDidShow` rather than `keyboardWillShow`: Android never emits the `will` pair, and
 * a screen that only listened for those would work on exactly the platform this project
 * cannot test.
 *
 * The Android height already excludes the navigation bar, so a `SafeAreaView` with a
 * `bottom` edge and this inset together cover the keyboard exactly rather than double up.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      setInset(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setInset(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return inset;
}
