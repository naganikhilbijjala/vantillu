import { Tabs } from 'expo-router';
import { CookingPot, List } from 'lucide-react-native';
import { border, fonts, layout, type Theme } from '../../src/theme/tokens';
import { useTheme, useThemedStyles } from '../../src/theme/useTheme';

/**
 * The bottom tab bar (Phase 5).
 *
 * **Two tabs, not three.** The mockup shows Insights alongside these, but Insights is
 * Phase 11 and explicitly cuttable — a tab that opens nothing is worse than a tab that
 * isn't there yet. It slots in beside Dishes when it exists.
 *
 * Today keeps the FAB, so the bar has to leave room for it: the FAB is positioned against
 * the tab bar's height rather than the screen's bottom edge.
 */

export const TAB_BAR_HEIGHT = 62;

export default function TabsLayout() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.steel2 },
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink3,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => (
            <CookingPot size={19} strokeWidth={1.6} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dishes"
        options={{
          title: 'Dishes',
          tabBarIcon: ({ color }) => <List size={19} strokeWidth={1.6} color={color} />,
        }}
      />
    </Tabs>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  bar: {
    backgroundColor: colors.steel1,
    borderTopWidth: border.thin,
    borderTopColor: colors.lineSoft,
    // The bar sits above the gesture inset, which the navigator adds on top of this.
    height: TAB_BAR_HEIGHT,
    paddingTop: 7,
    paddingBottom: 7,
  },
  item: {
    minHeight: layout.minTouchTarget,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    marginTop: 2,
  },
});
