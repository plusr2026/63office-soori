/* =========================================================
   Firebase 연결 정보 (공유 갤러리용)
   Firebase 콘솔 > 프로젝트 설정 > 내 앱 > "SDK 설정 및 구성"에 나오는 값을
   그대로 붙여넣으세요. 이 값들은 공개돼도 괜찮은 정보입니다
   (실제 보호는 firestore.rules 보안 규칙이 담당합니다).

   비워 두면 "미리보기 모드"로 동작합니다: 꾸미기·저장은 되지만
   갤러리에 올린 수리는 새로고침하면 사라집니다.
   ========================================================= */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAEhuijgkodngMBRv80UlelFuW9ZFMTmhg",
  authDomain: "office-soori.firebaseapp.com",
  projectId: "office-soori",
  storageBucket: "office-soori.firebasestorage.app",
  messagingSenderId: "146654629497",
  appId: "1:146654629497:web:2dba2199375ae93d95cea8",
};

/* 갤러리에서 한 번에 불러올 수리 개수 (무료 한도 절약용. 30 권장) */
window.GALLERY_PAGE_SIZE = 30;
