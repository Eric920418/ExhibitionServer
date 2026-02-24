import os
import warnings
import cv2
import mediapipe as mp
import sys
import time

# 忽略警告
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
warnings.filterwarnings("ignore", category=UserWarning, module='google.protobuf')

mp_face_detection = mp.solutions.face_detection
face_detection = mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5)

cap = cv2.VideoCapture(0)
current_brightness = 0.01

if not cap.isOpened():
    print("DATA:0.01", flush=True) 
    sys.exit()

while True:
    success, image = cap.read()
    if not success:
        time.sleep(0.02)
        continue

    img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_detection.process(img_rgb)
    target_brightness = 0.01 

    if results.detections:
        for detection in results.detections:
            bboxC = detection.location_data.relative_bounding_box
            face_width = bboxC.width
            
            # ====== 觸發邏輯 ======
            trigger_threshold = 0.22 # 觸發距離 (越小越難觸發)

            if face_width > trigger_threshold:
                val = 1.0 # 夠近直接全亮
            else:
                # 沒觸發前保持微光
                val = (face_width / trigger_threshold) * 0.1
                val = max(0.01, val)

            if val > target_brightness: target_brightness = val

    # 平滑插值 (變亮變暗都快一點)
    diff = target_brightness - current_brightness
    if diff > 0: current_brightness += diff * 0.20 
    else: current_brightness += diff * 0.15 
    
    current_brightness = max(0.01, min(current_brightness, 1.0))

    # 必須加 DATA: 標籤
    print(f"DATA:{current_brightness:.3f}", flush=True)
    
    # 不顯示視窗以節省資源 (如果想看畫面，可以把下面解開註解)
    # cv2.imshow('Debug', image)
    # if cv2.waitKey(30) & 0xFF == 27: break
    
    time.sleep(0.03)

cap.release()