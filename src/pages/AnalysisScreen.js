import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  AppState,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Camera } from "expo-camera";
import * as FaceDetector from "expo-face-detector";
// import AreaMarker from "./components/AreaMarker";
import FaceAreaMarker from "../components/FaceAreaMarker";
import { Audio } from "expo-av";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import moment from "moment";
import { sendEmail } from "../utils/functions";
import { useKeepAwake } from "expo-keep-awake";

const alarm = require("../../assets/audio/alarm-clock.mp3");
const alert = require("../../assets/audio/alert.mp3");

export default function AnalysisScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(null); // Permission to access camera
  const [faceDetected, setFaceDetected] = useState(false); // Is face detected
  const [config, setConfig] = useState(true); // show information on screen
  const [leftEyeOpenProbability, setLeftEyeOpenProbability] = useState(0); // probability of left eye open
  const [rightEyeOpenProbability, setRightEyeOpenProbabilityy] = useState(0); // probability of right eye open
  const [numbnessDetected, seNumbnessDetected] = useState(false); // Numbness Detected
  const [sleepDetected, setSleepDetected] = useState(false); // sleep Detected
  const [countDownStarted, setCountDownStarted] = useState(false); // count down numbness flag
  const [countDownSeconds, setCountDownSeconds] = useState(0); // count down numbness timer
  const [timer, setTimer] = useState(0); // num of times when handleFacesDetected function call
  const [seconds, setSeconds] = useState(0); // second timer
  const [fps, setFps] = useState(0); // timer / seconds
  const [blinkCount, setBlinksCount] = useState(0); // blink counter
  const [lastBlink, setLastBlink] = useState(0); // last blink detected
  const [blinkInterval, setBlinkInterval] = useState(0); // interval between two blink
  const [blinkDuration, setBlinkDuration] = useState(0); // interval between two blink
  const [blinkDurationCount, setBlinkDurationCount] = useState(0); // interval between two blink
  const [longBlinkDuration, setLongBlinkDuration] = useState(false);
  const [blinkDurationStart, setBlinkDurationStart] = useState(0);
  const [intervalFrequency, setIntervalFrequency] = useState(0); // frequency of blink interval less then blinkIntervalBelowAcceptable
  const [shortBlinkInterval, setShortBlinkInterval] = useState(false);
  const [type, setType] = useState(Camera.Constants.Type.front); // type of camera (front or back)
  const [alarmSound, setAlarmSound] = useState(undefined); // alert alarmSound
  const [alertSound, setAlertSound] = useState(undefined); // alert alarmSound
  const [faceProps, setFaceProps] = useState(); // face measures
  const [faceSizeBigger, setFaceSizeBig] = useState(false); // if face size is bigger than limit
  const [faceSizeSmaller, setFaceSizeSmaller] = useState(false); // if face size is smaller than limit

  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);

  const height = Dimensions.get("window").height;
  const width = Dimensions.get("window").width;

  const openEyeSleep = 0.9;
  const openEyeSleepSeconds = 1.5;
  const blinkIntervalBelowAcceptable = 3;
  const blinkDurationAboveAcceptable = 0.2;
  const faceUpperSizeLimit = width;
  const faceLowerSizeLimit = width * 0.3;

  // Função para previnir dispositivo entrar em modo hibernar
  useKeepAwake();

  useEffect(() => {
    AppState.addEventListener("change", _handleAppStateChange);

    return () => {
      AppState.removeEventListener("change", _handleAppStateChange);
    };
  }, []);

  const _handleAppStateChange = (nextAppState) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === "active"
    ) {
      navigation.navigate("Initial");
    }

    appState.current = nextAppState;
    setAppStateVisible(appState.current);
  };

  const stopAlarm = async () => {
    if (alarmSound) await alarmSound.stopAsync();
  };

  const playAlarm = async () => {
    console.log("Loading Sound");
    if (alarmSound === undefined) {
      const { sound } = await Audio.Sound.createAsync(alarm);
      setAlarmSound(sound);
      sound.setIsLoopingAsync(true);
      await sound.playAsync();
    } else await alarmSound.replayAsync();
  };

  const playAlert = async () => {
    console.log("Loading Sound");
    if (alertSound === undefined) {
      const { sound } = await Audio.Sound.createAsync(alert);
      setAlertSound(sound);
      await sound.playAsync();
    } else await alertSound.replayAsync();
  };

  const removeInfoOnStorage = async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      alert("There was an error removing informations.");
    }

    alert("Done.");
  };

  const saveInfoOnStorage = async (key, value) => {
    try {
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (e) {
      alert("There was an error saving informations.");
    }
  };

  const getInfoFromStorage = async (key) => {
    try {
      const jsonValue = await AsyncStorage.getItem(key);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
      alert("There was an error when recover informations.");
    }
  };

  const pushAndSave = async (key, value) => {
    const valueList = (await getInfoFromStorage(key)) ?? [];
    if (valueList.length >= 50) {
      valueList.pop();
    }
    valueList.push(value);
    saveInfoOnStorage(key, valueList);
    console.log(key, valueList);
  };

  const saveInfoDateTime = async (key, value) => {
    const timestamp = moment().utc().local().format("YYYY-MM-DD HH:mm:ss");
    const valueObject = value ? { value, timestamp } : { timestamp };
    pushAndSave(key, valueObject);
  };

  useEffect(() => {
    if (sleepDetected) playAlert();
  }, [sleepDetected]);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  useEffect(() => {
    if (seconds > 0) setFps((timer / seconds).toFixed(2));
  }, [seconds]);

  useEffect(() => {
    // When short blink interval is detected
    if (intervalFrequency > 3) {
      if (!shortBlinkInterval) saveInfoDateTime("ShortBlinkInterval");
      setShortBlinkInterval(true);
    } else {
      setShortBlinkInterval(false);
    }
    // When long blink duration is detected
    if (blinkDurationCount > 3) {
      if (!longBlinkDuration) saveInfoDateTime("LongBlinkDuration");
      setLongBlinkDuration(true);
    } else {
      setLongBlinkDuration(false);
    }
    //When short blink interval and long blink duration is detected
    if (intervalFrequency > 3 && blinkDurationCount > 3) {
      if (!sleepDetected) saveInfoDateTime("Sleep");
      setSleepDetected(true);
    } else {
      setSleepDetected(false);
    }
  }, [intervalFrequency, blinkDurationCount]);

  useEffect(() => {
    const counter = setInterval(() => {
      setSeconds((seconds) => seconds + 0.1);
    }, 100);
    return () => clearInterval(counter);
  }, []);

  if (hasPermission === null) {
    return <View />;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  const onAreaMarked = (bounds) => {
    const origin = bounds?.origin;
    const size = bounds?.size;
    const left = origin.x;
    const right = origin.x + size.width;
    const top = origin.y;
    const bottom = origin.y + size.height;
    setFaceProps({
      height: size.height,
      width: size.width,
      left,
      right,
      top,
      bottom,
    });
  };

  const initCountDown = () => {
    setCountDownStarted(true);
    if (countDownSeconds === 0) {
      setCountDownSeconds(seconds);
    } else if (seconds > countDownSeconds + openEyeSleepSeconds) {
      playAlarm();
      seNumbnessDetected(true);
      saveInfoDateTime("Numbness");
    }
  };

  const cancelCountDown = () => {
    setCountDownStarted(false);
    seNumbnessDetected(false);
    setCountDownSeconds(0);
    stopAlarm();
  };

  const verifyFaceSize = (bounds) => {
    const width = bounds?.size?.width;
    let isSizeOk = true;
    if (width >= faceUpperSizeLimit) {
      setFaceSizeBig(true);
      isSizeOk = false;
    } else setFaceSizeBig(false);
    if (width <= faceLowerSizeLimit) {
      setFaceSizeSmaller(true);
      isSizeOk = false;
    } else setFaceSizeSmaller(false);
    return isSizeOk;
  };

  const handleFacesDetected = (props) => {
    setTimer((timer) => timer + 1);
    if (props?.faces?.length > 0) {
      if (verifyFaceSize(props?.faces[0]?.bounds)) {
        onAreaMarked(props?.faces[0]?.bounds);
        setFaceDetected(true);
        const face = props.faces[0];

        setLeftEyeOpenProbability(face?.leftEyeOpenProbability);
        setRightEyeOpenProbabilityy(face?.rightEyeOpenProbability);
        if (
          face?.leftEyeOpenProbability <= openEyeSleep &&
          face?.rightEyeOpenProbability <= openEyeSleep
        ) {
          if (!countDownStarted) {
            setBlinkDurationStart(seconds);
            setBlinksCount((blicksCount) => blicksCount + 1);
            if (lastBlink > 0) {
              const thisBlinkInterval = seconds - lastBlink;
              setBlinkInterval(thisBlinkInterval);
              if (thisBlinkInterval < blinkIntervalBelowAcceptable) {
                setIntervalFrequency(
                  (intervalFrequency) => intervalFrequency + 1
                );
              } else setIntervalFrequency(0);
            }
            setLastBlink(seconds);
          }
          if (!numbnessDetected) initCountDown();
        } else {
          if (countDownStarted) {
            const blinkDur = seconds - blinkDurationStart;
            setBlinkDuration(blinkDur);
            saveInfoDateTime("Blink", blinkDur);
            if (blinkDur > blinkDurationAboveAcceptable) {
              setBlinkDurationCount(
                (blinkDurationCount) => blinkDurationCount + 1
              );
            } else {
              setBlinkDurationCount(0);
            }
          }
          cancelCountDown();
        }
      } else {
        setFaceDetected(false);
        cancelCountDown();
      }
    } else {
      setFaceDetected(false);
      setFaceProps();
      setFaceSizeSmaller(false);
      setFaceSizeBig(false);
    }
  };

  const getStatusColor = () => {
    if (!faceDetected) {
      return "#000000";
    }
    if (numbnessDetected) {
      return "#FF0000";
    }
    if (sleepDetected) {
      return "#FF6402";
    }
    if (shortBlinkInterval || longBlinkDuration) {
      return "#D9B51D";
    }
    if (faceDetected) {
      return "#039903";
    }
    return "#000000";
  };

  const getStatusText = () => {
    if (faceSizeBigger) return "move away from the camera";
    if (faceSizeSmaller) return "approach the camera";
    if (!faceDetected) return "Face not detected";
    if (numbnessDetected) return "Numbness";
    if (sleepDetected) return "Sleep";
    if (longBlinkDuration) return "Long blink duration";
    if (shortBlinkInterval) return "Short blink interval";
    return "Awake";
  };

  const getTimerFormatted = () => {
    return `${(seconds / 60).toFixed() < 10 ? "0" : ""}${(
      seconds / 60
    ).toFixed()}:${
      (seconds.toFixed() % 60).toString().length === 1 ? "0" : ""
    }${seconds.toFixed() % 60}`;
  };

  const finishAlert = async () => {
    setLoading(true);

    const Blink = await getInfoFromStorage("Blink");
    const ShortBlinkInterval = await getInfoFromStorage("ShortBlinkInterval");
    const LongBlinkDuration = await getInfoFromStorage("LongBlinkDuration");
    const Sleep = await getInfoFromStorage("Sleep");

    Alert.alert(
      "Finish!",
      "Do you want to send an email with the statistics?",
      [
        {
          text: "Sim",
          onPress: () =>
            sendEmail(
              "158788@upf.br",
              `Stats from ${route.params?.name}`,
              JSON.stringify({
                "-> Blink": Blink,
                "-> ShortBlinkInterval": ShortBlinkInterval,
                "-> LongBlinkDuration": LongBlinkDuration,
                "-> Sleep": Sleep,
              })
            ),
        },
        {
          text: "Não",
          onPress: () => navigation.goBack(),
          style: "cancel",
        },
      ]
    );
  };

  if (seconds < 1 || loading)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "white",
        }}
      >
        <ActivityIndicator size="large" color="gray" />
      </View>
    );

  return (
    <View style={{ ...styles.container, height }}>
      <Camera
        ratio={"16:9"}
        style={styles.camera}
        type={type}
        // useCamera2Api
        autoFocus={FaceDetector.Constants.AutoFocus?.on}
        whiteBalance={Camera.Constants.WhiteBalance?.auto}
        faceDetectorEnabled
        onFacesDetected={handleFacesDetected}
        faceDetectorSettings={{
          mode: FaceDetector.Constants.Mode?.fast,
          detectLandmarks: FaceDetector.Constants.Landmarks?.none,
          runClassifications: FaceDetector.Constants.Classifications?.all,
          tracking: true,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-around",
            paddingHorizontal: 5,
            top: 25,
          }}
        >
          <TouchableOpacity
            style={{ paddingHorizontal: 10 }}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back-ios" size={34} color="white" />
          </TouchableOpacity>
          <View
            style={{ ...styles.statusBox, backgroundColor: getStatusColor() }}
          >
            <Text style={styles.text}>{getStatusText()}</Text>
          </View>
          <View style={{ ...styles.timerBox }}>
            <Text style={styles.text}>{getTimerFormatted()}</Text>
          </View>
        </View>
        {config && (
          <View style={styles.faceInfoBox}>
            <Text style={styles.textInfo}>{`Sec(s): ${seconds.toFixed(
              1
            )}`}</Text>
            <Text style={styles.textInfo}>{`Frames: ${timer}`}</Text>
            <Text style={styles.textInfo}>{`Func called per sec: ${fps}`}</Text>
            <Text style={styles.textInfo}>{`Blinks: ${blinkCount}`}</Text>
            <Text
              style={styles.textInfo}
            >{`Blink interval: ${blinkInterval.toFixed(1)} sec`}</Text>
            <Text
              style={styles.textInfo}
            >{`Low interval count: ${intervalFrequency}`}</Text>
            <Text style={styles.textInfo}>{`count down sec: ${
              countDownSeconds > 0
                ? ((timer - countDownSeconds) / fps).toFixed(0)
                : 0
            }`}</Text>
            <Text
              style={styles.textInfo}
            >{`last blink duration: ${blinkDuration.toFixed(3)}`}</Text>
            <Text
              style={styles.textInfo}
            >{`last blink duration count: ${blinkDurationCount}`}</Text>
            {faceDetected && (
              <>
                <Text
                  style={[
                    styles.textInfo,
                    leftEyeOpenProbability < openEyeSleep && { color: "red" },
                  ]}
                >
                  {`Right open prob: ${(leftEyeOpenProbability * 100)?.toFixed(
                    2
                  )}%`}
                </Text>
                <Text
                  style={[
                    styles.textInfo,
                    rightEyeOpenProbability < openEyeSleep && {
                      color: "red",
                    },
                  ]}
                >
                  {`Left open prob: ${(rightEyeOpenProbability * 100)?.toFixed(
                    2
                  )}%`}
                </Text>
              </>
            )}
          </View>
        )}
        <FaceAreaMarker faceProps={faceProps} />
        {/* <AreaMarker faceOnArea={faceDetected} /> */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setConfig(!config)}
          >
            <MaterialIcons
              style={styles.icon}
              name="timeline"
              size={40}
              color="white"
            />
          </TouchableOpacity>
          {/* <View style={styles.icon} opacity={sleepDetected ? 1 : 0}>
            <Text
              style={{ color: "white", width: 150, textAlign: "center" }}
              numberOfLines={2}
            >
              It's recommended to stop driving
            </Text>
          </View> */}
          <TouchableOpacity style={styles.finishButton} onPress={finishAlert} />
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              setType(
                type === Camera.Constants.Type.back
                  ? Camera.Constants.Type.front
                  : Camera.Constants.Type.back
              );
            }}
          >
            <MaterialIcons
              style={styles.icon}
              name="flip-camera-android"
              size={40}
              color="white"
            />
          </TouchableOpacity>
        </View>
      </Camera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    paddingTop: 10,
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 30,
    paddingTop: 10,
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
  },
  button: {
    flex: 0.3,
    alignItems: "center",
  },
  finishButton: {
    backgroundColor: "#3C6A84",
    marginHorizontal: 20,
    borderWidth: 3,
    borderColor: "#FFFF",
    height: 80,
    width: 80,
    borderRadius: 80,
  },
  icon: {
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 50,
  },
  statusBox: {
    width: 250,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
  },
  timerBox: {
    width: 70,
    backgroundColor: "red",
    alignSelf: "center",
    justifyContent: "space-around",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
  },
  faceInfoBox: {
    marginTop: 80,
    paddingHorizontal: 10,
  },
  textInfo: {
    fontSize: 12,
    textAlign: "left",
    color: "white",
  },
  text: {
    fontSize: 17,
    textAlign: "center",
    color: "white",
  },
});
