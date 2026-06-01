/* ==========================================================================
   Minimalist Study System - Core Application Logic
   Handles routing, simulation algorithms, time prediction, Pomodoro, 
   localStorage logs, and dynamic SVG graph rendering.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // 1. Data Store & State Management
  // ==========================================
  const DEFAULT_STATS = {
    weeklyHours: 32,
    weeklyMinutes: 15,
    completedAssignments: 14,
    assignmentGoal: 20,
    weeklyData: {
      studyHours: [0, 3, 8, 1, 4.5, 0.5, 2.5], // Mon to Sun
      completedTasks: [0, 1, 3, 1, 2, 0, 1]
    },
    monthlyData: {
      studyHours: [12, 24, 32, 28], // Week 1 to Week 4
      completedTasks: [5, 9, 14, 11]
    }
  };

  // Load from LocalStorage or seed defaults
  let appState = JSON.parse(localStorage.getItem('minimalist_study_state'));
  if (!appState) {
    appState = { ...DEFAULT_STATS, assignments: [], events: [], notifications: [] };
    localStorage.setItem('minimalist_study_state', JSON.stringify(appState));
  } else {
    if (!appState.assignments) appState.assignments = [];
    if (!appState.events) appState.events = [];
    if (!appState.notifications) appState.notifications = [];
  }

  function saveState() {
    localStorage.setItem('minimalist_study_state', JSON.stringify(appState));
  }

  // Active inputs state
  let currentSimInputs = {
    subject: '',
    style: 'cramming',
    type: 'problems'
  };

  let currentPredInputs = {
    material: '',
    subject: '',
    chapter: '',
    startPage: 1,
    endPage: 150,
    questionCount: 40,
    intensity: 'deep',
    grade: 3,          // 1~6 (1 = top)
    difficulty: 'normal' // very-easy / easy / normal / hard / very-hard
  };

  // Last prediction result in minutes (for calibration)
  let lastPredictedMinutes = 0;

  // Timer run variables
  let timerInterval = null;
  let timerTotalSeconds = 0;
  let timerRemainingSeconds = 0;
  let isTimerPaused = false;

  // Web Audio Context for native synthesizer chime
  let audioCtx = null;

  // Subject lists
  const SUBJECTS = [
    '심리학 개론', '미적분학 및 연습', '알고리즘 개론', '인공지능 개론', 
    '유기화학', '컴퓨터 구조', '미시경제학', '서양미술사', '글쓰기 기초',
    '자료구조', '운영체제', '이산수학', '확률 및 통계', '일반물리학'
  ];

  // ==========================================
  // Known workbook difficulty map (한국 주요 문제집)
  // difficulty levels: very-easy / easy / normal / hard / very-hard
  // ==========================================
  const KNOWN_BOOKS = [
    // 수학
    { keywords: ['쎈', '개념원리', '수학의 기초'], difficulty: 'normal' },
    { keywords: ['블랙라벨', '킬러', 'top1000', 'top 1000'], difficulty: 'very-hard' },
    { keywords: ['자이스토리', 'ㅈㅅㅌ'], difficulty: 'hard' },
    { keywords: ['풍산자', '개념플러스유형', '개념+유형'], difficulty: 'easy' },
    { keywords: ['기본수학', '수학기본', '쉬운수학'], difficulty: 'very-easy' },
    { keywords: ['수학의 정석', '정석'], difficulty: 'hard' },
    { keywords: ['수능특강', '수능완성'], difficulty: 'normal' },
    { keywords: ['뉴런', '수분감'], difficulty: 'easy' },
    { keywords: ['rpe', 'rpy'], difficulty: 'very-hard' },
    // 영어
    { keywords: ['천일문', '어법끝', '수능영어'], difficulty: 'normal' },
    { keywords: ['독해기술', 'ebsi 영어', 'ebs 영어'], difficulty: 'normal' },
    { keywords: ['wordup', '워드업'], difficulty: 'easy' },
    { keywords: ['능률보카', 'voca', '단어장'], difficulty: 'easy' },
    // 과학
    { keywords: ['개념비법', '개념의 실력', '화학의 신'], difficulty: 'hard' },
    { keywords: ['물리의 신', '물리바이블'], difficulty: 'very-hard' },
    { keywords: ['하이탑', 'hi-top'], difficulty: 'hard' },
    { keywords: ['개념완성', '개념 완성'], difficulty: 'normal' },
    // 국어
    { keywords: ['화작문', '문학개념', '비문학'], difficulty: 'normal' },
    { keywords: ['수능국어', '리트'], difficulty: 'hard' },
    // 사회
    { keywords: ['생윤', '사문', '윤사', '한국지리'], difficulty: 'normal' },
    { keywords: ['세계사', '동아시아사'], difficulty: 'normal' },
  ];

  /**
   * 문제집 이름 기반 난이도 자동 추정
   * @param {string} bookName
   * @returns {string|null} difficulty value or null if unknown
   */
  function detectBookDifficulty(bookName) {
    if (!bookName) return null;
    const lower = bookName.toLowerCase();
    for (const book of KNOWN_BOOKS) {
      for (const kw of book.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          return book.difficulty;
        }
      }
    }
    return null;
  }

  // ==========================================
  // Calibration factor (보정값) from localStorage
  // calibrationFactor: ratio (e.g. 1.2 = user takes 20% longer than predicted)
  // ==========================================
  function getCalibrationFactor() {
    const raw = localStorage.getItem('study_calibration_factor');
    return raw ? parseFloat(raw) : 1.0;
  }

  function saveCalibrationFactor(factor) {
    localStorage.setItem('study_calibration_factor', String(factor));
  }

  // Formatted time helper: minutes -> "Xh Ym"
  function formatMinutes(totalMins) {
    totalMins = Math.max(0, Math.round(totalMins));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h 00m`;
    return `${h}h ${m}m`;
  }


  // ==========================================
  // Helper: Global Loading Overlay Animation
  // ==========================================
  function runLoadingCycle(phrases, callback) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    
    // Select both submit buttons to disable them during calculation
    const simSubmitBtn = document.getElementById('simulation-submit-btn');
    const predSubmitBtn = document.getElementById('prediction-submit-btn');
    
    if (simSubmitBtn) simSubmitBtn.disabled = true;
    if (predSubmitBtn) predSubmitBtn.disabled = true;
    
    // Show overlay with active class
    loadingOverlay.classList.add('active');
    
    let index = 0;
    loadingText.textContent = phrases[0];
    
    // Transition text every 500ms
    const interval = setInterval(() => {
      index++;
      if (index < phrases.length) {
        loadingText.textContent = phrases[index];
      }
    }, 500);
    
    // Complete cycle after phrases.length * 500ms (e.g. 2s for 4 phrases)
    setTimeout(() => {
      clearInterval(interval);
      
      // Perform calculation & transition
      callback();
      
      // Hide overlay
      loadingOverlay.classList.remove('active');
      
      // Re-enable buttons
      if (simSubmitBtn) simSubmitBtn.disabled = false;
      if (predSubmitBtn) predSubmitBtn.disabled = false;
    }, phrases.length * 500);
  }

  // ==========================================
  // Helper: Press & Hold (길게 누르기) Accelerator
  // ==========================================
  function setupPressAndHold(element, callback) {
    let timeoutId = null;
    let intervalId = null;
    let isHolding = false;
    let startTime = 0;

    function startPress(e) {
      // Prevent default on touch to avoid double triggers/scrolling
      if (e.type === 'touchstart') {
        e.preventDefault();
      }
      
      // Perform immediate single trigger first
      callback();
      isHolding = true;
      startTime = Date.now();

      // Clear existing timers
      cleanup();

      // Phase 1: Wait 500ms before starting auto-repeat
      timeoutId = setTimeout(() => {
        if (!isHolding) return;
        runRepeatedly();
      }, 500);
    }

    function runRepeatedly() {
      if (!isHolding) return;
      
      const elapsed = Date.now() - startTime;
      let delay = 150; // Moderate speed (500ms - 1.5s)
      
      if (elapsed > 3000) {
        delay = 40; // Very fast speed (>3s)
      } else if (elapsed > 1500) {
        delay = 80; // Faster speed (1.5s - 3s)
      }
      
      callback();

      // Schedule next repeat dynamically to adjust speed
      intervalId = setTimeout(runRepeatedly, delay);
    }

    function cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearTimeout(intervalId);
      timeoutId = null;
      intervalId = null;
    }

    function endPress() {
      isHolding = false;
      cleanup();
    }

    // Mouse Listeners
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', endPress);
    element.addEventListener('mouseleave', endPress);

    // Touch Listeners (Mobile compatibility)
    element.addEventListener('touchstart', startPress, { passive: false });
    element.addEventListener('touchend', endPress);
    element.addEventListener('touchcancel', endPress);
  }

  // ==========================================
  // 2. Navigation / Router & Sidebar Menu
  // ==========================================
  const navTabs = document.querySelectorAll('.nav-tab');
  const viewPanels = document.querySelectorAll('.view-panel');
  const headerTitle = document.getElementById('header-title-text');
  const appScrollContainer = document.getElementById('app-content-scroll');

  // Sidebar elements
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebarDrawer = document.getElementById('sidebar-drawer');
  const sidebarButtons = document.querySelectorAll('.sidebar-item-btn');

  // Mapping views to friendly header titles
  const VIEW_TITLES = {
    'home': '홈',
    'simulation-form': '과제 생존 마감 시뮬레이터',
    'simulation-result': '과제 생존 마감 시뮬레이터',
    'prediction-form': '공부 시간 예측',
    'prediction-result': '공부 시간 예측',
    'statistics': '통계',
    'calendar': '캘린더',
    'notifications': '알림 센터'
  };

  function switchView(viewId) {
    // Hide all panels, show matching panel
    viewPanels.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === `view-${viewId}`) {
        panel.classList.add('active');
      }
    });

    // Update bottom nav active state if it matches a primary tab
    navTabs.forEach(tab => {
      tab.classList.remove('active');
      const target = tab.getAttribute('data-target');
      
      // If we are on form or result subpages, keep main tab active
      if (target === 'simulation' && (viewId === 'simulation-form' || viewId === 'simulation-result')) {
        tab.classList.add('active');
      } else if (target === 'prediction' && (viewId === 'prediction-form' || viewId === 'prediction-result')) {
        tab.classList.add('active');
      } else if (target === viewId) {
        tab.classList.add('active');
      }
    });

    // Update sidebar buttons active state
    sidebarButtons.forEach(btn => {
      btn.classList.remove('active');
      const target = btn.getAttribute('data-target');
      if (target === 'simulation' && (viewId === 'simulation-form' || viewId === 'simulation-result')) {
        btn.classList.add('active');
      } else if (target === 'prediction' && (viewId === 'prediction-form' || viewId === 'prediction-result')) {
        btn.classList.add('active');
      } else if (target === viewId) {
        btn.classList.add('active');
      }
    });

    // Update header title text
    headerTitle.textContent = VIEW_TITLES[viewId] || 'Minimalist Study';

    // Reset scroll to top
    appScrollContainer.scrollTop = 0;

    // Special view triggers
    if (viewId === 'statistics') {
      renderSVGChart('weekly');
    } else if (viewId === 'home') {
      if (typeof renderDashboard === 'function') renderDashboard();
    } else if (viewId === 'calendar') {
      if (typeof renderCalendar === 'function') renderCalendar();
    } else if (viewId === 'notifications') {
      if (typeof renderNotifications === 'function') renderNotifications();
    }
  }

  // Bind Bottom Nav clicks
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      if (target === 'simulation') {
        switchView('simulation-form');
      } else if (target === 'prediction') {
        switchView('prediction-form');
      } else {
        switchView(target);
      }
    });
  });

  // Bind Sidebar items clicks
  sidebarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      sidebarOverlay.classList.remove('active');
      if (target === 'simulation') {
        switchView('simulation-form');
      } else if (target === 'prediction') {
        switchView('prediction-form');
      } else {
        switchView(target);
      }
    });
  });

  // Hamburger menu toggle
  menuToggleBtn.addEventListener('click', () => {
    sidebarOverlay.classList.toggle('active');
  });

  // Tap overlay to close sidebar
  sidebarOverlay.addEventListener('click', (e) => {
    if (e.target === sidebarOverlay) {
      sidebarOverlay.classList.remove('active');
    }
  });

  // Home Dashboard quick buttons navigation bindings
  document.getElementById('home-goto-sim-btn').addEventListener('click', () => switchView('simulation-form'));
  document.getElementById('home-goto-pred-btn').addEventListener('click', () => switchView('prediction-form'));
  document.getElementById('home-goto-timer-btn').addEventListener('click', () => switchView('prediction-result'));
  document.getElementById('home-goto-stats-btn').addEventListener('click', () => switchView('statistics'));

  // ==========================================
  // 3. Global Toast Warning Notifications
  // ==========================================
  const toastAlert = document.getElementById('toast-alert');
  const toastMessage = document.getElementById('toast-message');
  let toastTimeout = null;

  function showToast(msg) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMessage.textContent = msg;
    toastAlert.classList.add('active');
    toastTimeout = setTimeout(() => {
      toastAlert.classList.remove('active');
    }, 3000);
  }

  // ==========================================
  // 4. View 1: Subject Search Suggestions
  // ==========================================
  const subjectInput = document.getElementById('subject-search-input');
  const suggestionBox = document.getElementById('subject-suggestion-box');

  subjectInput.addEventListener('input', () => {
    const val = subjectInput.value.trim().toLowerCase();
    suggestionBox.innerHTML = '';
    
    if (!val) {
      suggestionBox.classList.remove('active');
      return;
    }

    const matches = SUBJECTS.filter(s => s.toLowerCase().includes(val));
    if (matches.length === 0) {
      suggestionBox.classList.remove('active');
      return;
    }

    matches.forEach(match => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      li.textContent = match;
      li.addEventListener('click', () => {
        subjectInput.value = match;
        currentSimInputs.subject = match;
        suggestionBox.classList.remove('active');
      });
      suggestionBox.appendChild(li);
    });
    
    suggestionBox.classList.add('active');
  });

  // Close suggestions when tapping outside
  document.addEventListener('click', (e) => {
    if (e.target !== subjectInput && e.target !== suggestionBox) {
      suggestionBox.classList.remove('active');
    }
  });

  // ==========================================
  // 5. Card Toggle Selected State Handler
  // ==========================================
  
  // Study style selection
  const studyStyleCards = document.querySelectorAll('#study-style-container .study-method-card');
  studyStyleCards.forEach(card => {
    card.addEventListener('click', () => {
      studyStyleCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentSimInputs.style = card.getAttribute('data-value');
    });
  });

  // Assignment type selection
  const assignmentCards = document.querySelectorAll('#assignment-type-grid .assignment-card');
  assignmentCards.forEach(card => {
    card.addEventListener('click', () => {
      assignmentCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentSimInputs.type = card.getAttribute('data-value');
    });
  });

  // Study Mode selection (Screen 3)
  const modeCards = document.querySelectorAll('#study-mode-list .mode-card');
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      modeCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentPredInputs.intensity = card.getAttribute('data-value');
    });
  });

  // ==========================================
  // 6. View 1 -> 4: Deadline Simulation Logic
  // ==========================================
  const simSubmitBtn = document.getElementById('simulation-submit-btn');
  const simResetBtn = document.getElementById('sim-reset-btn');

  const simResultHours = document.getElementById('sim-result-hours');
  const simResultProgressFill = document.getElementById('sim-result-progress-fill');
  const simResultProgressVal = document.getElementById('sim-result-progress-val');
  const simStatusTitle = document.getElementById('sim-status-title');
  const simStatusDesc = document.getElementById('sim-status-desc');

  simSubmitBtn.addEventListener('click', () => {
    const inputSubj = subjectInput.value.trim();
    const simDeadlineInput = document.getElementById('sim-deadline-input');
    const deadlineVal = simDeadlineInput ? simDeadlineInput.value : '';

    if (!inputSubj) {
      showToast('과목 또는 과제명을 입력해주세요.');
      return;
    }
    if (!deadlineVal) {
      showToast('마감일시를 설정해주세요.');
      return;
    }

    currentSimInputs.subject = inputSubj;

    const SIM_PHRASES = [
      "과제 생존 확률 계산 중...",
      "마감 위험도 분석 중...",
      "추천 시작 시점 계산 중...",
      "결과 생성 중..."
    ];

    runLoadingCycle(SIM_PHRASES, () => {
      // Simulation Math Calculation
      let baseMinutes = 150; // default 2h 30m

      // Check specific default combination to hit screen 4 exact specs
      if (currentSimInputs.style === 'cramming' && currentSimInputs.type === 'problems') {
        baseMinutes = 150; // exactly 2h 30m
      } else {
        // Dynamic computation
        if (currentSimInputs.type === 'report') {
          baseMinutes = 180;
        } else if (currentSimInputs.type === 'problems') {
          baseMinutes = 150;
        } else if (currentSimInputs.type === 'presentation') {
          baseMinutes = 105;
        } else if (currentSimInputs.type === 'project') {
          baseMinutes = 255;
        }
        if (currentSimInputs.style === 'cramming') {
          baseMinutes = Math.max(60, baseMinutes - 20);
        } else if (currentSimInputs.style === 'deep') {
          baseMinutes = baseMinutes + 75;
        }
        // Hash code subject modifier
        let hash = 0;
        for (let i = 0; i < currentSimInputs.subject.length; i++) {
          hash = currentSimInputs.subject.charCodeAt(i) + ((hash << 5) - hash);
        }
        const modMin = (Math.abs(hash) % 3) * 15 - 15;
        baseMinutes += modMin;
      }

      // Format output hours/minutes for base
      const hrs = Math.floor(baseMinutes / 60);
      const mins = baseMinutes % 60;
      const timeStr = `${hrs}h ${mins > 0 ? mins + 'm' : '00m'}`;

      // ---- New Recommendation Math ----
      const now = new Date();
      const deadline = new Date(deadlineVal);
      const strictStart = new Date(deadline.getTime() - (baseMinutes * 60000));
      const safeStart = new Date(deadline.getTime() - (baseMinutes * 1.3 * 60000));
      
      let statusStr = "분석 중";
      let statusColor = "var(--primary)";
      let postponeStr = "-";
      let markerNowPercent = 0;

      // Status determination
      if (now > deadline) {
        statusStr = "이미 늦음";
        statusColor = "var(--error)";
        postponeStr = "더 이상 미루기 어렵습니다.";
      } else if (now > strictStart) {
        statusStr = "위험";
        statusColor = "var(--error)";
        postponeStr = "더 이상 미루기 어렵습니다.";
      } else if (now > safeStart) {
        statusStr = "촉박";
        statusColor = "#ff9800";
        const diffMins = Math.max(0, (strictStart.getTime() - now.getTime()) / 60000);
        postponeStr = `최대 ${formatDuration(diffMins)} 더 미룰 수 있습니다.`;
      } else {
        const diffMinsToSafe = (safeStart.getTime() - now.getTime()) / 60000;
        if (diffMinsToSafe > 24 * 60) {
          statusStr = "충분히 여유 있음";
          statusColor = "#4caf50";
        } else {
          statusStr = "적정";
          statusColor = "#2196f3";
        }
        const diffMins = Math.max(0, (strictStart.getTime() - now.getTime()) / 60000);
        postponeStr = `최대 ${formatDuration(diffMins)} 더 미룰 수 있습니다.`;
      }

      // Timeline marker math (relative to total visual span)
      // Span = safeStart - 1day ~ Deadline + 2 hours
      const spanStart = safeStart.getTime() - (24 * 60 * 60000);
      const spanEnd = deadline.getTime() + (2 * 60 * 60000);
      const totalSpan = spanEnd - spanStart;
      
      const getPos = (t) => Math.max(5, Math.min(95, ((t - spanStart) / totalSpan) * 100));
      
      document.getElementById('marker-safe').style.left = `${getPos(safeStart.getTime())}%`;
      document.getElementById('marker-strict').style.left = `${getPos(strictStart.getTime())}%`;
      document.getElementById('marker-deadline').style.left = `${getPos(deadline.getTime())}%`;
      
      const nowPos = getPos(now.getTime());
      document.getElementById('marker-now').style.left = `${nowPos}%`;
      markerNowPercent = nowPos;

      // Set UI outputs
      simResultHours.textContent = timeStr;
      
      // Formatting time text
      const fmtDate = (d) => `${d.getMonth()+1}월 ${d.getDate()}일 ${d.getHours() >= 12 ? '오후 ' + (d.getHours()===12 ? 12 : d.getHours()-12) : '오전 ' + (d.getHours()===0 ? 12 : d.getHours())}시 ${d.getMinutes()}분`;
      
      document.getElementById('sim-safe-time-text').textContent = `${fmtDate(safeStart)} 이전`;
      document.getElementById('sim-strict-time-text').textContent = `최소 ${fmtDate(strictStart)}`;
      document.getElementById('sim-postpone-text').textContent = postponeStr;
      
      const badge = document.getElementById('sim-current-status-badge');
      badge.textContent = statusStr;
      badge.style.backgroundColor = statusColor;
      badge.style.color = "white";

      // Save Assignment & Sync Calendar Event
      const assignmentId = 'task_' + Date.now();
      const newAssignment = {
        id: assignmentId,
        title: inputSubj,
        subject: inputSubj,
        deadline: deadline.getTime(),
        baseMinutes: baseMinutes,
        safeStart: safeStart.getTime(),
        strictStart: strictStart.getTime(),
        completed: false,
        createdAt: now.getTime()
      };
      appState.assignments.push(newAssignment);

      // Create timezone-safe ISO date string for calendar (YYYY-MM-DD)
      const tzOffset = (new Date()).getTimezoneOffset() * 60000;
      const localISOTime = (new Date(deadline.getTime() - tzOffset)).toISOString().slice(0, -1);
      const dateString = localISOTime.split('T')[0];

      const newEvent = {
        id: 'event_' + Date.now(),
        assignmentId: assignmentId,
        title: `[마감] ${inputSubj}`,
        date: dateString,
        startTime: deadline.toTimeString().substring(0, 5),
        endTime: new Date(deadline.getTime() + 60*60000).toTimeString().substring(0,5),
        memo: '자동 생성된 과제 마감일',
        importance: 'high'
      };
      appState.events.push(newEvent);
      saveState();

      switchView('simulation-result');

      // Trigger bar fill animation
      setTimeout(() => {
        document.getElementById('sim-timeline-fill').style.width = `${markerNowPercent}%`;
        simResultProgressFill.style.width = `85%`; // Keep original progress bar static visual for study progress
      }, 100);
      
      if(typeof checkNotifications === 'function') checkNotifications();
    });
  });

  function formatDuration(totalMins) {
    if (totalMins <= 0) return '0분';
    const d = Math.floor(totalMins / (24 * 60));
    const h = Math.floor((totalMins % (24 * 60)) / 60);
    const m = Math.floor(totalMins % 60);
    let str = '';
    if (d > 0) str += `${d}일 `;
    if (h > 0) str += `${h}시간 `;
    if (m > 0 || (d === 0 && h === 0)) str += `${m}분`;
    return str.trim();
  }

  simResetBtn.addEventListener('click', () => {
    subjectInput.value = '';
    currentSimInputs.subject = '';
    switchView('simulation-form');
  });

  // ==========================================
  // 7. View 3 -> 2: AI-Based Study Time Predictor
  // ==========================================
  const predSubmitBtn = document.getElementById('prediction-submit-btn');

  const predResultHours = document.getElementById('pred-result-hours');
  const predResultMin = document.getElementById('pred-result-min');
  const predResultMax = document.getElementById('pred-result-max');
  const predResultProgressFill = document.getElementById('pred-result-progress-fill');
  const predResultConfidence = document.getElementById('pred-result-confidence');
  const predResultComplexity = document.getElementById('pred-result-complexity');
  const calibrationIndicator = document.getElementById('calibration-indicator');

  // Input elements
  const materialNameInput = document.getElementById('material-name-input');
  const materialStartPage = document.getElementById('material-start-page');
  const materialEndPage = document.getElementById('material-end-page');
  const predQuestionsInput = document.getElementById('pred-questions-input');
  const predSubjectInput = document.getElementById('pred-subject-input');
  const predChapterInput = document.getElementById('pred-chapter-input');

  // ── Difficulty auto-detect when user types book name ──
  materialNameInput.addEventListener('input', () => {
    const name = materialNameInput.value.trim();
    const detected = detectBookDifficulty(name);
    const diffSelector = document.getElementById('pred-difficulty-selector');
    const chips = diffSelector.querySelectorAll('.difficulty-chip');
    const label = diffSelector.previousElementSibling; // the <label> above

    // Remove old auto-badge
    const oldBadge = label.querySelector('.difficulty-auto-badge');
    if (oldBadge) oldBadge.remove();

    if (detected) {
      // Update chip selection
      chips.forEach(c => {
        c.classList.remove('selected');
        if (c.getAttribute('data-value') === detected) c.classList.add('selected');
      });
      currentPredInputs.difficulty = detected;

      // Show auto-detected badge
      const badge = document.createElement('span');
      badge.className = 'difficulty-auto-badge';
      badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width:10px;height:10px"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg> 자동 감지됨`;
      label.appendChild(badge);
    }
  });

  // ── Grade chip selection ──
  const gradeChips = document.querySelectorAll('#pred-grade-selector .grade-chip');
  gradeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      gradeChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      currentPredInputs.grade = parseInt(chip.getAttribute('data-value'));
    });
  });

  // ── Difficulty chip selection ──
  const diffChips = document.querySelectorAll('#pred-difficulty-selector .difficulty-chip');
  diffChips.forEach(chip => {
    chip.addEventListener('click', () => {
      diffChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      currentPredInputs.difficulty = chip.getAttribute('data-value');
      // Remove auto-badge if user manually overrides
      const label = document.getElementById('pred-difficulty-selector').previousElementSibling;
      const badge = label.querySelector('.difficulty-auto-badge');
      if (badge) badge.remove();
    });
  });

  /**
   * Core AI prediction engine.
   * Returns { minutes, minMinutes, maxMinutes, confidence, complexity }
   */
  function computePrediction(inputs) {
    const { startPage, endPage, questionCount, intensity, grade, difficulty } = inputs;
    const totalPages = Math.max(1, endPage - startPage + 1);
    const questions = Math.max(0, questionCount || 0);

    // ── Base minutes per page by intensity ──
    // deep: 1.0 min/page, balanced: 0.67, skimming: 0.40
    const PAGE_RATE = { deep: 1.0, balanced: 0.67, skimming: 0.40 };
    const pageRate = PAGE_RATE[intensity] || 0.67;

    // ── Base minutes per question by intensity ──
    // deep: 4 min/q, balanced: 2.5, skimming: 1.2
    const Q_RATE = { deep: 4.0, balanced: 2.5, skimming: 1.2 };
    const qRate = Q_RATE[intensity] || 2.5;

    // Combined base (weight pages 60%, questions 40% if both present)
    let baseMinutes;
    if (questions > 0) {
      baseMinutes = (totalPages * pageRate * 0.6) + (questions * qRate * 0.4);
    } else {
      baseMinutes = totalPages * pageRate;
    }

    // ── Difficulty multiplier ──
    const DIFF_MULT = {
      'very-easy': 0.65,
      'easy':      0.80,
      'normal':    1.00,
      'hard':      1.30,
      'very-hard': 1.65
    };
    const diffMult = DIFF_MULT[difficulty] || 1.0;
    baseMinutes *= diffMult;

    // ── Grade modifier (학업 수준 보정) ──
    // Grade 1 = fastest (0.7x), Grade 6 = slowest (1.5x)
    // Linear interpolation: grade 1->0.70, 2->0.82, 3->0.95, 4->1.10, 5->1.28, 6->1.50
    const GRADE_MULT = [null, 0.70, 0.82, 0.95, 1.10, 1.28, 1.50];
    const gradeMult = GRADE_MULT[grade] || 1.0;
    baseMinutes *= gradeMult;

    // ── Intensity base confidence & complexity label ──
    let confidence, complexity;
    if (intensity === 'deep') {
      confidence = 85; complexity = '높음';
    } else if (intensity === 'balanced') {
      confidence = 90; complexity = '보통';
    } else {
      confidence = 75; complexity = '낮음';
    }

    // Confidence boost for known difficulty (was auto-detected or explicitly set)
    if (difficulty !== 'normal') confidence = Math.min(95, confidence + 3);
    // Confidence boost for more data (question count provided)
    if (questions > 0) confidence = Math.min(97, confidence + 2);

    // ── Variance band (±%) for min/max ──
    const VARIANCE = {
      'very-easy': 0.10, 'easy': 0.12,
      'normal': 0.15,
      'hard': 0.20, 'very-hard': 0.25
    };
    const variance = VARIANCE[difficulty] || 0.15;
    const minMinutes = baseMinutes * (1 - variance);
    const maxMinutes = baseMinutes * (1 + variance);

    // ── Apply calibration factor ──
    const cal = getCalibrationFactor();
    const calibrated = baseMinutes * cal;
    const calMin = minMinutes * cal;
    const calMax = maxMinutes * cal;

    return {
      minutes: Math.round(calibrated),
      minMinutes: Math.round(calMin),
      maxMinutes: Math.round(calMax),
      confidence,
      complexity
    };
  }

  predSubmitBtn.addEventListener('click', () => {
    const materialName = materialNameInput.value.trim();
    const startP = parseInt(materialStartPage.value);
    const endP = parseInt(materialEndPage.value);
    const qCount = parseInt(predQuestionsInput.value) || 0;

    // Form validation
    if (!materialName) {
      showToast('교재 또는 자료명을 입력해주세요.');
      return;
    }
    if (isNaN(startP) || isNaN(endP) || startP < 1 || endP < 1 || startP > endP) {
      showToast('올바른 페이지 범위를 입력해주세요.');
      return;
    }

    // Save inputs to state
    currentPredInputs.material = materialName;
    currentPredInputs.subject = predSubjectInput ? predSubjectInput.value.trim() : '';
    currentPredInputs.chapter = predChapterInput ? predChapterInput.value.trim() : '';
    currentPredInputs.startPage = startP;
    currentPredInputs.endPage = endP;
    currentPredInputs.questionCount = qCount;

    const PRED_PHRASES = [
      "학습 교재 분량 분석 중...",
      "집중 난이도 평가 중...",
      "AI 예상 소요 시간 산출 중...",
      "예측 결과 생성 중..."
    ];

    runLoadingCycle(PRED_PHRASES, () => {
      const result = computePrediction(currentPredInputs);
      lastPredictedMinutes = result.minutes;

      const hrs = Math.floor(result.minutes / 60);
      const mins = result.minutes % 60;
      const timeStr = formatMinutes(result.minutes);

      // Show calibration indicator if factor != 1.0
      const cal = getCalibrationFactor();
      if (calibrationIndicator) {
        calibrationIndicator.style.display = Math.abs(cal - 1.0) > 0.01 ? 'inline-flex' : 'none';
      }

      // Fill prediction outputs
      predResultHours.textContent = timeStr;
      if (predResultMin) predResultMin.textContent = formatMinutes(result.minMinutes);
      if (predResultMax) predResultMax.textContent = formatMinutes(result.maxMinutes);
      predResultConfidence.textContent = `${result.confidence}%`;
      predResultComplexity.textContent = result.complexity;

      // Reset actual time inputs
      const actualH = document.getElementById('actual-hours-input');
      const actualM = document.getElementById('actual-minutes-input');
      if (actualH) actualH.value = hrs;
      if (actualM) actualM.value = mins;

      // Hide previous save message
      const savedMsg = document.getElementById('calibration-saved-msg');
      if (savedMsg) savedMsg.classList.remove('visible');

      // Set Pomodoro Timer pre-fill Pickers
      const hourBlock = document.getElementById('timer-picker-hour');
      const minBlock = document.getElementById('timer-picker-minute');
      hourBlock.textContent = String(hrs).padStart(2, '0');
      minBlock.textContent = String(mins).padStart(2, '0');

      // Trigger prediction layout progress fill animation
      predResultProgressFill.style.width = '0%';
      switchView('prediction-result');
      setTimeout(() => {
        predResultProgressFill.style.width = `${result.confidence}%`;
      }, 100);
    });
  });

  // ==========================================
  // Actual Time Calibration Handler
  // ==========================================
  const saveActualTimeBtn = document.getElementById('save-actual-time-btn');
  if (saveActualTimeBtn) {
    saveActualTimeBtn.addEventListener('click', () => {
      const actualH = parseInt(document.getElementById('actual-hours-input').value) || 0;
      const actualM = parseInt(document.getElementById('actual-minutes-input').value) || 0;
      const actualMinutes = actualH * 60 + actualM;

      if (actualMinutes <= 0) {
        showToast('실제 소요 시간을 입력해주세요.');
        return;
      }
      if (lastPredictedMinutes <= 0) {
        showToast('예측 결과가 없습니다. 먼저 예측을 실행해주세요.');
        return;
      }

      // Compute new ratio between actual and predicted
      const newRatio = actualMinutes / lastPredictedMinutes;

      // Smooth update: blend 70% old factor + 30% new observation (Exponential moving average)
      const oldFactor = getCalibrationFactor();
      const updatedFactor = oldFactor * 0.70 + newRatio * 0.30;

      // Clamp to reasonable range [0.5, 2.5]
      const clampedFactor = Math.min(2.5, Math.max(0.5, updatedFactor));
      saveCalibrationFactor(clampedFactor);

      // Show confirmation message
      const savedMsg = document.getElementById('calibration-saved-msg');
      if (savedMsg) {
        savedMsg.classList.add('visible');
        // Show calibration indicator badge
        if (calibrationIndicator) {
          calibrationIndicator.style.display = 'inline-flex';
        }
        // Auto-hide after 4s
        setTimeout(() => savedMsg.classList.remove('visible'), 4000);
      }

      showToast('보정값이 저장되었습니다!');
    });
  }

  // ==========================================
  // 8. View 2: Sleek Pomodoro Timer Controller
  // ==========================================
  const adjustHourUp = document.getElementById('adjust-hour-up');
  const adjustHourDown = document.getElementById('adjust-hour-down');
  const adjustMinUp = document.getElementById('adjust-minute-up');
  const adjustMinDown = document.getElementById('adjust-minute-down');

  const hourBlock = document.getElementById('timer-picker-hour');
  const minBlock = document.getElementById('timer-picker-minute');

  const timerStartBtn = document.getElementById('timer-start-btn');
  const timerPauseBtn = document.getElementById('timer-pause-btn');
  const timerStopBtn = document.getElementById('timer-stop-btn');

  const timerPickerPanel = document.getElementById('timer-picker-panel');
  const timerRunningPanel = document.getElementById('timer-running-panel');

  const timerRunningDigits = document.getElementById('timer-running-digits');
  const timerStatusBadge = document.getElementById('timer-status-badge');
  const timerRingFill = document.getElementById('timer-ring-fill');

  // Adjust hour buttons (1-hour step, press & hold accelerated)
  setupPressAndHold(adjustHourUp, () => {
    let h = parseInt(hourBlock.textContent);
    h = (h + 1) % 24;
    hourBlock.textContent = String(h).padStart(2, '0');
  });

  setupPressAndHold(adjustHourDown, () => {
    let h = parseInt(hourBlock.textContent);
    h = (h - 1 + 24) % 24;
    hourBlock.textContent = String(h).padStart(2, '0');
  });

  // Adjust minute buttons (1-minute step, press & hold accelerated)
  setupPressAndHold(adjustMinUp, () => {
    let m = parseInt(minBlock.textContent);
    m = (m + 1) % 60;
    minBlock.textContent = String(m).padStart(2, '0');
  });

  setupPressAndHold(adjustMinDown, () => {
    let m = parseInt(minBlock.textContent);
    m = (m - 1 + 60) % 60;
    minBlock.textContent = String(m).padStart(2, '0');
  });

  // Synthesizer chime audio alerts using native browser Web Audio API
  function initAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playAlertChime() {
    try {
      initAudioContext();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      
      const now = audioCtx.currentTime;
      // High-premium minimalist bell synthesizer sound (sine wave chime)
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5 note
      osc1.frequency.exponentialRampToValueAtTime(440, now + 1.2); // Smooth drop to A4

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1320, now); // E6 note
      osc2.frequency.exponentialRampToValueAtTime(660, now + 1.2);

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.5); // Fast smooth decay

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.5);
      osc2.stop(now + 1.5);
    } catch (e) {
      console.warn("Audio Context chime failed to play: ", e);
    }
  }

  // Timer Start
  timerStartBtn.addEventListener('click', () => {
    initAudioContext();
    
    const h = parseInt(hourBlock.textContent);
    const m = parseInt(minBlock.textContent);
    
    timerTotalSeconds = (h * 3600) + (m * 60);
    
    if (timerTotalSeconds <= 0) {
      showToast('학습 시간을 1분 이상 설정해 주세요.');
      return;
    }

    timerRemainingSeconds = timerTotalSeconds;
    isTimerPaused = false;

    // Show Running Panel
    timerPickerPanel.style.display = 'none';
    timerRunningPanel.style.display = 'block';

    timerStatusBadge.textContent = '집중 연구중';
    timerStatusBadge.style.color = 'var(--text-secondary)';
    timerPauseBtn.textContent = '일시 정지';
    
    updateTimerUI();
    
    // Launch Interval timer
    timerInterval = setInterval(() => {
      if (!isTimerPaused) {
        timerRemainingSeconds--;
        updateTimerUI();

        if (timerRemainingSeconds <= 0) {
          handleTimerComplete();
        }
      }
    }, 1000);
  });

  // Timer pause / resume
  timerPauseBtn.addEventListener('click', () => {
    isTimerPaused = !isTimerPaused;
    if (isTimerPaused) {
      timerPauseBtn.textContent = '재개';
      timerStatusBadge.textContent = '학습 대기';
      timerStatusBadge.style.color = 'var(--text-caption)';
    } else {
      timerPauseBtn.textContent = '일시 정지';
      timerStatusBadge.textContent = '집중 연구중';
      timerStatusBadge.style.color = 'var(--text-secondary)';
    }
  });

  // Timer Stop / Terminate
  timerStopBtn.addEventListener('click', () => {
    resetActiveTimerState();
  });

  function updateTimerUI() {
    const h = Math.floor(timerRemainingSeconds / 3600);
    const m = Math.floor((timerRemainingSeconds % 3600) / 60);
    const s = timerRemainingSeconds % 60;

    // Format HH:MM:SS
    timerRunningDigits.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    // SVG Ring Fill dashoffset calculation (Base stroke-dasharray = 628)
    const ratio = timerRemainingSeconds / timerTotalSeconds;
    const offset = 628 - (628 * ratio);
    timerRingFill.style.strokeDashoffset = offset;
  }

  function resetActiveTimerState() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerRemainingSeconds = 0;
    timerTotalSeconds = 0;

    timerRunningPanel.style.display = 'none';
    timerPickerPanel.style.display = 'block';
  }

  // Timer Completed Event
  function handleTimerComplete() {
    playAlertChime();
    
    // Capture study details
    const hoursStudied = Math.floor(timerTotalSeconds / 3600);
    const minutesStudied = Math.floor((timerTotalSeconds % 3600) / 60);

    // Save statistics in AppState
    appState.weeklyHours += hoursStudied;
    appState.weeklyMinutes += minutesStudied;
    if (appState.weeklyMinutes >= 60) {
      appState.weeklyHours += Math.floor(appState.weeklyMinutes / 60);
      appState.weeklyMinutes = appState.weeklyMinutes % 60;
    }
    appState.completedAssignments += 1;

    // Push study hours to Wednesday (active Day 2 - index 2) or current day (Sunday/Sun = index 6)
    const currentDayIndex = new Date().getDay(); // 0 is Sun, 1 is Mon etc.
    const mappedDayIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1; // Mon=0, Sun=6
    appState.weeklyData.studyHours[mappedDayIndex] += (timerTotalSeconds / 3600);
    appState.weeklyData.completedTasks[mappedDayIndex] += 1;

    // Save persisted state
    localStorage.setItem('minimalist_study_state', JSON.stringify(appState));

    // Reset UI
    resetActiveTimerState();

    // Alert
    alert(`🎉 대단합니다! ${hoursStudied > 0 ? hoursStudied + '시간 ' : ''}${minutesStudied}분의 학습이 성공적으로 완료되어 통계 대시보드에 기록되었습니다.`);
  }

  // ==========================================
  // 9. View 5: Dynamic Statistics Dashboard SVG
  // ==========================================
  const toggleWeeklyBtn = document.getElementById('toggle-weekly-btn');
  const toggleMonthlyBtn = document.getElementById('toggle-monthly-btn');

  const statsTotalHours = document.getElementById('stats-total-hours');
  const statsTotalMinutes = document.getElementById('stats-total-minutes');
  const statsCompletedCount = document.getElementById('stats-completed-count');
  const statsCompletedProgressFill = document.getElementById('stats-completed-progress-fill');
  const statsCompletedPercentLabel = document.getElementById('stats-completed-percent-label');

  // Toggle chart duration button events
  toggleWeeklyBtn.addEventListener('click', () => {
    toggleWeeklyBtn.classList.add('active');
    toggleMonthlyBtn.classList.remove('active');
    renderSVGChart('weekly');
  });

  toggleMonthlyBtn.addEventListener('click', () => {
    toggleWeeklyBtn.classList.remove('active');
    toggleMonthlyBtn.classList.add('active');
    renderSVGChart('monthly');
  });

  function updateDashboardMetrics() {
    statsTotalHours.textContent = appState.weeklyHours;
    statsTotalMinutes.textContent = appState.weeklyMinutes;
    statsCompletedCount.textContent = appState.completedAssignments;

    const goalPercent = Math.min(100, Math.round((appState.completedAssignments / appState.assignmentGoal) * 100));
    statsCompletedProgressFill.style.width = `${goalPercent}%`;
    statsCompletedPercentLabel.textContent = `목표의 ${goalPercent}% 달성`;
  }

  // Interactive SVG Combined Bar-Line Chart Generator
  function renderSVGChart(mode = 'weekly') {
    updateDashboardMetrics();

    const chartSvg = document.getElementById('stats-svg-chart');
    const tooltip = document.getElementById('chart-tooltip');
    chartSvg.innerHTML = ''; // Clean old nodes

    const margin = { top: 30, right: 30, bottom: 40, left: 40 };
    const width = 400;
    const height = 200;
    const graphWidth = width - margin.left - margin.right;
    const graphHeight = height - margin.top - margin.bottom;

    // SVG Namespaces
    const svgNS = "http://www.w3.org/2000/svg";

    // 1. Draw helper grids and base lines
    const gridYValues = [0, 5, 10];
    gridYValues.forEach(val => {
      // Y position relative to graph coordinate space
      const yPos = margin.top + graphHeight - (val / 10) * graphHeight;

      // Draw dashed horizontal lines
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', margin.left);
      line.setAttribute('y1', yPos);
      line.setAttribute('x2', width - margin.right);
      line.setAttribute('y2', yPos);
      line.setAttribute('class', val === 0 ? 'chart-axis-line' : 'chart-grid-line');
      chartSvg.appendChild(line);

      // Y Text Labels
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', margin.left - 10);
      text.setAttribute('y', yPos + 4);
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('class', 'chart-axis-text');
      text.textContent = `${val}h`;
      chartSvg.appendChild(text);
    });

    // Data selector
    let hoursData = [];
    let completedData = [];
    let xLabels = [];

    if (mode === 'weekly') {
      hoursData = appState.weeklyData.studyHours;
      completedData = appState.weeklyData.completedTasks;
      xLabels = ['월', '화', '수', '목', '금', '토', '일'];
    } else {
      hoursData = appState.monthlyData.studyHours;
      completedData = appState.monthlyData.completedTasks;
      xLabels = ['1주', '2주', '3주', '4주'];
    }

    const nPoints = hoursData.length;
    const colWidth = graphWidth / nPoints;

    // Max limiters to prevent overflow math
    const maxYVal = 10;
    const maxTasksVal = 4; // Max task line scale is 4 tasks standard

    // Draw Bar Charts (Study hours)
    for (let i = 0; i < nPoints; i++) {
      const hVal = hoursData[i];
      const barHeight = Math.min(graphHeight, (hVal / maxYVal) * graphHeight);
      
      const xPos = margin.left + (i * colWidth) + (colWidth * 0.25);
      const yPos = margin.top + graphHeight - barHeight;
      const barWidth = colWidth * 0.5;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', xPos);
      rect.setAttribute('y', yPos);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', Math.max(1, barHeight));
      rect.setAttribute('class', 'chart-bar');
      rect.setAttribute('rx', '2'); // border radius for soft minimalist details

      // Wednesday 수 check style matching bold label
      if (mode === 'weekly' && i === 2) {
        rect.style.fill = '#c6c6c6'; // darker gray accent for active day
      }

      // Add tooltip interactions
      rect.addEventListener('mousemove', (e) => {
        rect.style.fill = 'var(--primary)';
        tooltip.textContent = `${hVal.toFixed(1)}시간 학습`;
        tooltip.classList.add('active');
        
        // Compute relative positions
        const wrapperRect = chartSvg.getBoundingClientRect();
        const absoluteX = e.clientX - wrapperRect.left;
        const absoluteY = e.clientY - wrapperRect.top;
        
        tooltip.style.left = `${absoluteX}px`;
        tooltip.style.top = `${absoluteY - 8}px`;
      });

      rect.addEventListener('mouseleave', () => {
        rect.style.fill = (mode === 'weekly' && i === 2) ? '#c6c6c6' : '#e5e5e5';
        tooltip.classList.remove('active');
      });

      chartSvg.appendChild(rect);
    }

    // Draw Line Chart (Completed tasks)
    let pointsString = "";
    const lineCoords = [];

    for (let i = 0; i < nPoints; i++) {
      const tVal = completedData[i];
      const xPos = margin.left + (i * colWidth) + (colWidth / 2);
      // Let scale max tasks mapping to Y axis height (e.g. 4 tasks = top max)
      const yPos = margin.top + graphHeight - (tVal / maxTasksVal) * graphHeight;

      lineCoords.push({ x: xPos, y: yPos, val: tVal });
      pointsString += `${xPos},${yPos} `;
    }

    // Polyline connector
    const polyline = document.createElementNS(svgNS, 'polyline');
    polyline.setAttribute('points', pointsString.trim());
    polyline.setAttribute('class', 'chart-line');
    chartSvg.appendChild(polyline);

    // Draw Line Points (Dots) and interactive markers
    lineCoords.forEach((pt, i) => {
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', '4');
      circle.setAttribute('class', 'chart-dot');

      if (mode === 'weekly' && i === 2) {
        circle.setAttribute('r', '5'); // Wed dot is slightly bigger in UI
      }

      circle.addEventListener('mousemove', (e) => {
        circle.setAttribute('r', '7');
        tooltip.textContent = `${pt.val}개 과제 완료`;
        tooltip.classList.add('active');

        const wrapperRect = chartSvg.getBoundingClientRect();
        const absoluteX = e.clientX - wrapperRect.left;
        const absoluteY = e.clientY - wrapperRect.top;

        tooltip.style.left = `${absoluteX}px`;
        tooltip.style.top = `${absoluteY - 8}px`;
      });

      circle.addEventListener('mouseleave', () => {
        circle.setAttribute('r', (mode === 'weekly' && i === 2) ? '5' : '4');
        tooltip.classList.remove('active');
      });

      chartSvg.appendChild(circle);

      // Draw custom 수 Wednesday overlay text "8h" directly above Wednesday dot point!
      if (mode === 'weekly' && i === 2) {
        const valueText = document.createElementNS(svgNS, 'text');
        valueText.setAttribute('x', pt.x);
        valueText.setAttribute('y', pt.y - 12);
        valueText.setAttribute('class', 'chart-dot-active-text');
        valueText.textContent = `${hoursData[i]}h`;
        chartSvg.appendChild(valueText);
      }
    });

    // Draw X Axis labels
    for (let i = 0; i < nPoints; i++) {
      const xPos = margin.left + (i * colWidth) + (colWidth / 2);
      const yPos = height - margin.bottom + 18;

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', xPos);
      label.setAttribute('y', yPos);
      label.setAttribute('text-anchor', 'middle');
      
      // Wednesday is bold in screenshot details
      if (mode === 'weekly' && i === 2) {
        label.setAttribute('class', 'chart-axis-text active');
      } else {
        label.setAttribute('class', 'chart-axis-text');
      }
      
      label.textContent = xLabels[i];
      chartSvg.appendChild(label);
    }
  }

  // ==========================================
  // Calendar Rendering & Logic
  // ==========================================
  let currentCalDate = new Date();
  let selectedDateString = '';

  const calendarDaysContainer = document.getElementById('calendar-days-container');
  const calendarMonthTitle = document.getElementById('calendar-month-title');
  const dailyEventList = document.getElementById('daily-event-list');
  const selectedDateTitle = document.getElementById('selected-date-title');
  const selectedDateCount = document.getElementById('selected-date-count');

  function renderCalendar() {
    if (!calendarDaysContainer) return;
    calendarDaysContainer.innerHTML = '';
    
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    
    calendarMonthTitle.textContent = `${year}년 ${month + 1}월`;
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
    const totalDays = lastDay.getDate();
    
    // Empty prefix days
    for (let i = 0; i < startDayOfWeek; i++) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'cal-day empty';
      calendarDaysContainer.appendChild(emptyDiv);
    }
    
    const today = new Date();
    
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      
      const dayDiv = document.createElement('div');
      dayDiv.className = 'cal-day';
      if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
        dayDiv.classList.add('today');
        if(!selectedDateString) {
          selectedDateString = dateStr;
          dayDiv.classList.add('selected');
        }
      }
      
      if (selectedDateString === dateStr) {
        dayDiv.classList.add('selected');
      }
      
      dayDiv.textContent = d;
      dayDiv.addEventListener('click', () => {
        selectedDateString = dateStr;
        renderCalendar();
        renderDailyEvents();
      });
      
      // Events for this day
      const dayEvents = appState.events.filter(e => e.date === dateStr);
      if (dayEvents.length > 0) {
        const dotsDiv = document.createElement('div');
        dotsDiv.className = 'event-dots';
        // max 3 dots
        dayEvents.slice(0, 3).forEach(e => {
          const dot = document.createElement('div');
          dot.className = `event-dot ${e.importance === 'high' ? 'high' : ''}`;
          dotsDiv.appendChild(dot);
        });
        dayDiv.appendChild(dotsDiv);
      }
      
      calendarDaysContainer.appendChild(dayDiv);
    }
  }

  function renderDailyEvents() {
    if (!dailyEventList) return;
    
    const [y, m, d] = selectedDateString.split('-');
    selectedDateTitle.textContent = `${parseInt(m)}월 ${parseInt(d)}일`;
    
    const dayEvents = appState.events.filter(e => e.date === selectedDateString);
    // Sort by startTime
    dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    selectedDateCount.textContent = `일정 ${dayEvents.length}개`;
    
    dailyEventList.innerHTML = '';
    
    if (dayEvents.length === 0) {
      dailyEventList.innerHTML = '<li style="text-align:center; padding:20px; color:var(--text-caption); font-size:13px;">일정이 없습니다.</li>';
      return;
    }
    
    dayEvents.forEach(e => {
      const li = document.createElement('li');
      li.className = 'today-widget-item';
      if(e.importance === 'high') li.classList.add('urgent');
      
      li.innerHTML = `
        <div class="time">${e.startTime}</div>
        <div class="details">
          <div class="title">${e.title}</div>
          <div class="tag">${e.endTime} • ${e.memo}</div>
        </div>
        <button class="icon-btn delete-event-btn" data-id="${e.id}" style="color:var(--text-placeholder); border:none; background:none; padding:4px; cursor:pointer;"><svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
      `;
      
      li.querySelector('.delete-event-btn').addEventListener('click', () => {
        if(confirm('이 일정을 삭제하시겠습니까?')) {
          appState.events = appState.events.filter(ev => ev.id !== e.id);
          // Delete associated assignment if it was a task
          if (e.assignmentId) {
            appState.assignments = appState.assignments.filter(a => a.id !== e.assignmentId);
          }
          saveState();
          renderCalendar();
          renderDailyEvents();
          if (typeof renderDashboard === 'function') renderDashboard();
        }
      });
      
      dailyEventList.appendChild(li);
    });
  }

  // Bind Calendar Controls
  const calPrevBtn = document.getElementById('cal-prev-month');
  const calNextBtn = document.getElementById('cal-next-month');
  if(calPrevBtn) calPrevBtn.addEventListener('click', () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar();
  });
  if(calNextBtn) calNextBtn.addEventListener('click', () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar();
  });

  // FAB Event Modal
  const fabAddEvent = document.getElementById('fab-add-event');
  const eventModal = document.getElementById('event-modal');
  const closeEventModal = document.getElementById('close-event-modal');
  const saveEventBtn = document.getElementById('save-event-btn');

  if(fabAddEvent) fabAddEvent.addEventListener('click', () => {
    document.getElementById('event-date-input').value = selectedDateString;
    eventModal.style.display = 'flex';
  });
  if(closeEventModal) closeEventModal.addEventListener('click', () => {
    eventModal.style.display = 'none';
  });
  if(saveEventBtn) saveEventBtn.addEventListener('click', () => {
    const title = document.getElementById('event-title-input').value.trim();
    const date = document.getElementById('event-date-input').value;
    const start = document.getElementById('event-start-time-input').value;
    const end = document.getElementById('event-end-time-input').value;
    const importance = document.getElementById('event-importance-input').value;
    const memo = document.getElementById('event-memo-input').value.trim();
    
    if(!title || !date || !start || !end) {
      showToast('필수 항목을 모두 입력해주세요.');
      return;
    }
    
    appState.events.push({
      id: 'evt_' + Date.now(),
      title, date, startTime: start, endTime: end, importance, memo
    });
    saveState();
    
    eventModal.style.display = 'none';
    
    document.getElementById('event-title-input').value = '';
    document.getElementById('event-memo-input').value = '';
    
    if(date === selectedDateString) renderDailyEvents();
    renderCalendar();
    if (typeof renderDashboard === 'function') renderDashboard();
  });

  // ==========================================
  // Dashboard Rendering
  // ==========================================
  function renderDashboard() {
    const dashboardStats = document.getElementById('home-dashboard-stats');
    const urgentCardContainer = document.getElementById('home-urgent-card-container');
    const todayList = document.getElementById('home-today-list');
    
    if(!dashboardStats) return;
    
    const now = new Date();
    // Local date string properly
    const tzOffset = now.getTimezoneOffset() * 60000;
    const todayStr = (new Date(now.getTime() - tzOffset)).toISOString().split('T')[0];
    
    const activeTasks = appState.assignments.filter(a => !a.completed);
    const completedCount = appState.assignments.filter(a => a.completed).length;
    const todayEvents = appState.events.filter(e => e.date === todayStr);
    
    // This week deadlines (within 7 days)
    const sevenDaysLater = now.getTime() + (7 * 24 * 60 * 60 * 1000);
    const thisWeekTasks = activeTasks.filter(a => a.deadline <= sevenDaysLater).length;
    
    // Nearest deadline task
    const sortedTasks = [...activeTasks].sort((a,b) => a.deadline - b.deadline);
    const nearestTask = sortedTasks[0];
    
    dashboardStats.innerHTML = `
      <div class="dashboard-stat-card">
        <span class="stat-label">진행 중인 과제</span>
        <span class="stat-value">${activeTasks.length}개</span>
      </div>
      <div class="dashboard-stat-card">
        <span class="stat-label">완료한 과제</span>
        <span class="stat-value" style="color:#4caf50;">${completedCount}개</span>
      </div>
      <div class="dashboard-stat-card">
        <span class="stat-label">이번 주 마감</span>
        <span class="stat-value stat-highlight">${thisWeekTasks}건</span>
      </div>
      <div class="dashboard-stat-card">
        <span class="stat-label">오늘 일정</span>
        <span class="stat-value">${todayEvents.length}개</span>
      </div>
    `;

    // Urgent Card
    urgentCardContainer.innerHTML = '';
    urgentCardContainer.style.display = 'none';
    
    if (nearestTask) {
      const diffMins = (nearestTask.deadline - now.getTime()) / 60000;
      if (diffMins > 0 && diffMins <= 24 * 60) {
        // Less than 24 hours left
        urgentCardContainer.style.display = 'block';
        urgentCardContainer.innerHTML = `
          <div class="urgent-warning-card">
            <h3><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:20px;height:20px"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> 긴급: 마감 임박</h3>
            <p>${nearestTask.title}<br>마감까지 <strong>${formatDuration(diffMins)}</strong> 남았습니다.</p>
            <button class="btn-urgent-check" data-id="${nearestTask.id}">지금 완료 처리하기</button>
          </div>
        `;
        
        urgentCardContainer.querySelector('.btn-urgent-check').addEventListener('click', (e) => {
          nearestTask.completed = true;
          saveState();
          renderDashboard();
          showToast('과제가 완료 처리되었습니다.');
        });
      }
    }
    
    // Today Widget List
    todayList.innerHTML = '';
    if (todayEvents.length === 0) {
      todayList.innerHTML = '<li style="padding:12px; color:var(--text-caption); font-size:13px; text-align:center;">오늘 일정이 없습니다.</li>';
    } else {
      const sortedToday = [...todayEvents].sort((a,b) => a.startTime.localeCompare(b.startTime));
      sortedToday.slice(0, 4).forEach(e => {
        const li = document.createElement('li');
        li.className = `today-widget-item ${e.importance === 'high' ? 'urgent' : ''}`;
        li.innerHTML = `
          <div class="time">${e.startTime}</div>
          <div class="details">
            <div class="title">${e.title}</div>
            <div class="tag">${e.memo}</div>
          </div>
        `;
        todayList.appendChild(li);
      });
    }
  }
  
  const homeGotoCal = document.getElementById('home-goto-calendar-btn');
  if(homeGotoCal) homeGotoCal.addEventListener('click', () => switchView('calendar'));

  // ==========================================
  // Notification Center
  // ==========================================
  function addNotification(title, body, type = 'normal') {
    appState.notifications.unshift({
      id: 'notif_' + Date.now(),
      title, body, type,
      timestamp: Date.now(),
      read: false
    });
    // Keep max 50
    if (appState.notifications.length > 50) appState.notifications.pop();
    saveState();
    
    // Browser Push
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: body });
    }
  }

  function requestNotifPermission() {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  function renderNotifications(filter = 'all') {
    const listContainer = document.getElementById('notification-list-container');
    if(!listContainer) return;
    
    listContainer.innerHTML = '';
    
    let notifs = appState.notifications;
    if (filter === 'urgent') notifs = notifs.filter(n => n.type === 'urgent');
    if (filter === 'task') notifs = notifs.filter(n => n.type === 'task');
    
    if (notifs.length === 0) {
      listContainer.innerHTML = '<li style="text-align: center; padding: 32px; color: var(--text-placeholder); font-size: 14px;">알림이 없습니다.</li>';
      return;
    }
    
    notifs.forEach(n => {
      const li = document.createElement('li');
      li.className = `notification-item ${!n.read ? 'unread' : ''} ${n.type === 'urgent' ? 'urgent' : ''}`;
      
      const dateStr = new Date(n.timestamp).toLocaleString();
      
      li.innerHTML = `
        <div class="notif-header">
          <span>${n.type === 'urgent' ? '긴급' : (n.type === 'task' ? '과제' : '일반')}</span>
          <span>${dateStr}</span>
        </div>
        <div class="notif-title">${n.title}</div>
        <div class="notif-body">${n.body}</div>
        <div class="notif-actions">
          ${!n.read ? `<button class="mark-read-btn" data-id="${n.id}">읽음 처리</button>` : ''}
          <button class="delete-notif-btn" data-id="${n.id}" style="color:var(--error);">삭제</button>
        </div>
      `;
      
      const markBtn = li.querySelector('.mark-read-btn');
      if (markBtn) {
        markBtn.addEventListener('click', () => {
          n.read = true;
          saveState();
          renderNotifications(filter);
        });
      }
      
      li.querySelector('.delete-notif-btn').addEventListener('click', () => {
        appState.notifications = appState.notifications.filter(x => x.id !== n.id);
        saveState();
        renderNotifications(filter);
      });
      
      listContainer.appendChild(li);
    });
  }

  const notifTabs = document.querySelectorAll('.notif-tab');
  notifTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      notifTabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = 'var(--surface)';
        t.style.color = 'var(--text-primary)';
        t.style.borderColor = 'var(--border-subtle)';
      });
      tab.classList.add('active');
      tab.style.background = 'var(--primary)';
      tab.style.color = 'var(--on-primary)';
      tab.style.borderColor = 'var(--border-strong)';
      renderNotifications(tab.getAttribute('data-filter'));
    });
  });

  const clearAllNotifs = document.getElementById('clear-all-notif-btn');
  if(clearAllNotifs) clearAllNotifs.addEventListener('click', () => {
    appState.notifications = [];
    saveState();
    renderNotifications(document.querySelector('.notif-tab.active').getAttribute('data-filter'));
  });

  // ==========================================
  // Smart Background Notification Checker
  // ==========================================
  const notifiedEvents = new Set(); // in-memory tracking of already notified limits

  function checkNotifications() {
    const now = Date.now();
    requestNotifPermission();

    appState.assignments.forEach(task => {
      if (task.completed) return;
      
      const minsLeft = (task.deadline - now) / 60000;
      
      // 3 hours, 1 hour, 30 min checks
      const checks = [
        { mins: 180, id: `3h_${task.id}`, title: `[마감 3시간 전] ${task.title}` },
        { mins: 60, id: `1h_${task.id}`, title: `[마감 1시간 전] ${task.title}` },
        { mins: 30, id: `30m_${task.id}`, title: `[긴급] 마감 30분 전! ${task.title}` }
      ];
      
      checks.forEach(chk => {
        if (minsLeft > 0 && minsLeft <= chk.mins && !notifiedEvents.has(chk.id)) {
          notifiedEvents.add(chk.id);
          const type = chk.mins === 30 ? 'urgent' : 'task';
          let body = `마감까지 ${formatDuration(minsLeft)} 남았습니다.`;
          if (type === 'urgent') body = `아직 완료되지 않았습니다. 즉시 확인하세요!`;
          addNotification(chk.title, body, type);
        }
      });
      
      // Recommendation alerts
      const minsToSafe = (task.safeStart - now) / 60000;
      if (minsToSafe > 0 && minsToSafe <= 30 && !notifiedEvents.has(`safe_${task.id}`)) {
        notifiedEvents.add(`safe_${task.id}`);
        addNotification(`[시작 권장] ${task.title}`, '과제를 여유롭게 끝내려면 지금 시작하는 것이 좋습니다.', 'task');
      }
      
      const minsToStrict = (task.strictStart - now) / 60000;
      if (minsToStrict > 0 && minsToStrict <= 30 && !notifiedEvents.has(`strict_${task.id}`)) {
        notifiedEvents.add(`strict_${task.id}`);
        addNotification(`[최소 시작] ${task.title}`, '지금 시작해야 마감에 겨우 맞출 수 있습니다. 서두르세요!', 'urgent');
      }
    });
  }

  // Check every minute
  setInterval(checkNotifications, 60000);

  // Initialize data on load
  if (!selectedDateString) {
    const d = new Date();
    selectedDateString = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  
  // Make these accessible for the initial route loading if needed
  window.renderDashboard = renderDashboard;
  window.renderCalendar = renderCalendar;
  window.renderNotifications = renderNotifications;
  
  // Initial render
  setTimeout(() => {
    checkNotifications();
    if(document.getElementById('view-home').classList.contains('active')) {
      renderDashboard();
    }
  }, 100);

  // ==========================================
  // 10. Initialization view startup
  // ==========================================
  switchView('home');

});
