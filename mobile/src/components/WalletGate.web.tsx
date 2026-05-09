import {Pressable, Text, View, StyleSheet} from "react-native";

// Web preview stubs — actual auth lives at toldya-nine.vercel.app. These give
// the layout something to render so `expo start --web` can show the UI shell.

export function AppKit() {
    return null;
}

export function AppKitButton() {
    return (
        <View style={styles.btn}>
            <Text style={styles.btnText}>web preview</Text>
        </View>
    );
}

export function useAppKit() {
    return {open: () => alert("Use the iOS / Android app to sign in.")};
}

const styles = StyleSheet.create({
    btn: {
        backgroundColor: "#f4f4f0",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
    },
    btnText: {fontSize: 12, color: "#6b6b6b"},
});
