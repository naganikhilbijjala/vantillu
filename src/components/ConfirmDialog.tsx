import { Modal, Pressable, Text, View } from 'react-native';
import { border, layout, radius, space, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * "Are you sure?", in the app's own type and colour.
 *
 * This replaces `Alert.alert`, which was the one thing the app drew that ignored the theme
 * entirely: a stock Android dialog in Roboto and Material blue, in the middle of a screen
 * built out of brushed steel and turmeric — and in light mode on a dark device, since the
 * platform dialog follows the *system* scheme rather than the one `useColorScheme` reported
 * to everything else. `Alert` has no styling surface at all, so there was nothing to fix
 * short of drawing it.
 *
 * Two behaviours it keeps from the native one, because they are the reason a native dialog
 * feels safe: **the backdrop and the hardware back both cancel**, never confirm. Every
 * caller here is asking about something destructive, so the accidental outcome has to be
 * the harmless one.
 */

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Draws the confirming action in gongura. For anything that loses data. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const styles = useThemedStyles(makeStyles);
  const { elevation } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's hardware back. Without it the dialog is uncloseable by the gesture
      // people reach for first.
      onRequestClose={onCancel}
      // Covers the status bar too, or the dim stops short of the top of the screen.
      statusBarTranslucent
    >
      <Pressable
        style={styles.scrim}
        accessibilityLabel={`Dismiss ${title}`}
        accessibilityRole="button"
        onPress={onCancel}
      >
        {/* Swallows taps that land on the card, so touching the message does not read as
            touching the backdrop and dismiss the thing you are reading. */}
        <Pressable
          style={[styles.card, elevation.float]}
          accessibilityViewIsModal
          onPress={() => {}}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            >
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.action,
                styles.confirm,
                destructive && styles.confirmDestructive,
                pressed && styles.actionPressed,
              ]}
            >
              <Text
                style={[
                  styles.confirmLabel,
                  destructive && styles.confirmLabelDestructive,
                ]}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  scrim: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: layout.screenPaddingH,
    backgroundColor: colors.scrim,
  },
  card: {
    width: '100%' as const,
    // Wide enough for two sentences, narrow enough to read as a dialog on a tablet.
    maxWidth: 400,
    padding: space.xl,
    gap: space.md,
    borderRadius: radius.card,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    // The raised surface, so it inverts with the scheme like every other card.
    backgroundColor: colors.steel1,
  },
  title: {
    ...text.title,
    fontSize: 18,
    lineHeight: 23,
  },
  message: {
    ...text.bodySmall,
  },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: space.sm,
    marginTop: space.md,
  },
  action: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: border.thin,
    borderColor: 'transparent' as const,
  },
  actionPressed: {
    backgroundColor: colors.steelPressed,
  },
  confirm: {
    borderColor: colors.line,
  },
  confirmDestructive: {
    // Outlined rather than filled: white on the dark-mode gongura misses the 4.5:1 floor
    // for body text, and the `Ink` member of the pair is what the palette provides for
    // exactly this — an accent used as text (SPEC §14.3).
    borderColor: colors.gonguraInk,
  },
  cancelLabel: {
    ...text.control,
    fontSize: 13,
  },
  confirmLabel: {
    ...text.control,
    fontSize: 13,
    color: colors.ink,
  },
  confirmLabelDestructive: {
    color: colors.gonguraInk,
  },
});
