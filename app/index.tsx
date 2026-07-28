import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Index() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.text}>vantillu</Text>
        <Link href="/debug" style={styles.link}>
          database
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#16181A',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  text: {
    color: '#8A9199',
    fontSize: 16,
    letterSpacing: 2,
  },
  link: {
    color: '#6E757C',
    fontSize: 13,
    letterSpacing: 1,
  },
});
