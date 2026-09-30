import { Image, Modal, StyleSheet } from 'react-native';

const splash = require('../assets/cyrelle-splash-logo.jpg');

export function SplashCover() {
  return (
    <Modal animationType="none" statusBarTranslucent transparent={false} visible onRequestClose={() => undefined}>
      <Image accessibilityLabel="Cyrelle" resizeMode="cover" source={splash} style={styles.image} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#070708',
  },
});
