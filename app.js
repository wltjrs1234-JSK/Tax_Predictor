/**
 * TaxFlow - 2026 연말정산 예측 계산기 핵심 로직
 */

document.addEventListener('DOMContentLoaded', () => {
    // 테마 설정 초기화
    initTheme();

    // 탭 내비게이션 초기화
    initTabs();

    // 숫자 입력 및 증감 버튼 바인딩
    initNumberInputs();

    // 실시간 계산 이벤트 리스너 등록
    initCalcEvents();

    // 평균 기납부세액 자동 입력 버튼 이벤트
    document.getElementById('auto-prepaid-tax').addEventListener('click', autoFillPrepaidTax);

    // 다중 사용자 관리 시스템 초기화
    initUsers();
});

/* ==========================================
   1. 테마 & 탭 & UI 편의 기능
   ========================================== */

// 테마 토글 (다크모드/라이트모드)
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        // 테마 변경 시 SVG 차트 다시 그리기 (색상 대응)
        calculateTax();
    });
}

// 탭 기능
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            
            const targetId = `tab-${tab.dataset.tab}`;
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// 부양가족 수 조절 버튼 (+ / -)
function initNumberInputs() {
    const numWrappers = document.querySelectorAll('.number-input-wrapper');
    numWrappers.forEach(wrapper => {
        const input = wrapper.querySelector('input');
        const decreaseBtn = wrapper.querySelector('.decrease');
        const increaseBtn = wrapper.querySelector('.increase');

        decreaseBtn.addEventListener('click', () => {
            let val = parseInt(input.value) || 0;
            const min = parseInt(input.min) || 0;
            if (val > min) {
                input.value = val - 1;
                triggerInputChange(input);
            }
        });

        increaseBtn.addEventListener('click', () => {
            let val = parseInt(input.value) || 0;
            const max = parseInt(input.max) || 99;
            if (val < max) {
                input.value = val + 1;
                triggerInputChange(input);
            }
        });
    });
}

// 프로그램 방식으로 input 이벤트를 강제 트리거
function triggerInputChange(element) {
    const event = new Event('input', { bubbles: true });
    element.dispatchEvent(event);
}

// 한글 금액 변환 헬퍼 (예: 50000000 -> 5,000만 원)
function formatKoreanNumber(num) {
    if (isNaN(num) || num <= 0) return '0 원';
    
    const unitWords = ['원', '만 원', '억 원', '조 원'];
    let result = '';
    let temp = num;
    let unitIdx = 0;

    while (temp > 0) {
        let mod = temp % 10000;
        if (mod > 0) {
            let formatted = mod.toLocaleString('ko-KR');
            result = `${formatted}${unitWords[unitIdx]} ` + result;
        }
        temp = Math.floor(temp / 10000);
        unitIdx++;
    }
    return result.trim();
}

// 콤마 포맷팅 헬퍼 (예: 1500000 -> 1,500,000)
function formatComma(num) {
    if (isNaN(num) || num === null) return '0';
    return Number(num).toLocaleString('ko-KR');
}

// 콤마 제거 후 숫자 파싱 헬퍼
function getNumericValue(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const val = el.value.replace(/,/g, '');
    return parseFloat(val) || 0;
}

// 실시간 천 단위 콤마 포맷터
function formatInputWithComma(inputElement) {
    let value = inputElement.value.replace(/[^0-9]/g, ''); // 숫자 이외 제거
    if (value === '') {
        inputElement.value = '';
        return;
    }
    inputElement.value = formatComma(value);
}

// 소득 정보 한글 표시 업데이트 & 실시간 계산 바인딩
function initCalcEvents() {
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        // 천 단위 콤마 대상 금액 인풋 필드인 경우 (inputmode="numeric" 텍스트 필드)
        if (input.tagName === 'INPUT' && input.getAttribute('inputmode') === 'numeric') {
            input.addEventListener('input', (e) => {
                formatInputWithComma(e.target);
                
                // 한글 표시 힌트 실시간 갱신
                if (e.target.id === 'gross-income') {
                    const val = getNumericValue('gross-income');
                    document.getElementById('gross-income-korean').innerText = formatKoreanNumber(val);
                } else if (e.target.id === 'prepaid-tax') {
                    const val = getNumericValue('prepaid-tax');
                    document.getElementById('prepaid-tax-korean').innerText = formatKoreanNumber(val);
                }
                
                // 데이터 실시간 자동저장 및 세금 재계산
                saveCurrentUserData();
                calculateTax();
            });
        } else {
            // 그 외 일반 필드들 (라디오, 체크박스, 셀렉트, 일반 텍스트 등)
            const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT' || input.type === 'radio') ? 'change' : 'input';
            input.addEventListener(eventType, () => {
                saveCurrentUserData();
                calculateTax();
            });
        }
    });
}

// 기납부세액 자동 채우기
function autoFillPrepaidTax() {
    const gross = getNumericValue('gross-income');
    if (gross <= 0) {
        alert('먼저 총급여액을 입력해주세요.');
        return;
    }
    
    // 평균 소득세 원천징수 비율을 이용한 간이 세액 산출 (지방세 제외)
    let estimate = 0;
    if (gross <= 30000000) {
        estimate = gross * 0.01; // 1%
    } else if (gross <= 50000000) {
        estimate = gross * 0.022; // 2.2%
    } else if (gross <= 80000000) {
        estimate = gross * 0.045; // 4.5%
    } else if (gross <= 120000000) {
        estimate = gross * 0.075; // 7.5%
    } else {
        estimate = gross * 0.12; // 12%
    }
    
    // 원천징수 비율 선택치 반영 (80%, 100%, 120%)
    const withholdingRateEl = document.querySelector('input[name="withholding-rate"]:checked');
    const withholdingRate = withholdingRateEl ? parseFloat(withholdingRateEl.value) : 1.0;
    estimate = estimate * withholdingRate;

    // 만원 단위 절사
    estimate = Math.floor(estimate / 10000) * 10000;
    
    const prepaidInput = document.getElementById('prepaid-tax');
    prepaidInput.value = estimate;
    triggerInputChange(prepaidInput);
}


/* ==========================================
   2. 연말정산 예측 계산 엔진 (2026 기준 세법)
   ========================================== */

function calculateTax() {
    // ----------------------------------------
    // [1] 기본 입력 데이터 로드
    // ----------------------------------------
    const grossIncome = Math.max(0, getNumericValue('gross-income'));
    const prepaidTax = Math.max(0, getNumericValue('prepaid-tax'));
    
    // 인적공제 항목
    const hasSpouse = document.getElementById('spouse-deduction').checked;
    const childCount = Math.max(0, parseInt(document.getElementById('child-count').value) || 0);
    const dependentCount = Math.max(0, parseInt(document.getElementById('dependents-count').value) || 0);
    const elderlyCount = Math.max(0, parseInt(document.getElementById('elderly-count').value) || 0);
    const disabledCount = Math.max(0, parseInt(document.getElementById('disabled-count').value) || 0);
    const isWomanDeduction = document.getElementById('woman-deduction').checked;
    const isSingleParent = document.getElementById('single-parent-deduction').checked;

    // 소득공제 지출 항목
    const cardCredit = Math.max(0, getNumericValue('card-credit'));
    const cardDebit = Math.max(0, getNumericValue('card-debit'));
    const cardCash = Math.max(0, getNumericValue('card-cash'));
    const cardCulture = Math.max(0, getNumericValue('card-culture'));
    const cardMarket = Math.max(0, getNumericValue('card-market'));
    const cardTransit = Math.max(0, getNumericValue('card-transit'));

    const housingSaving = Math.max(0, getNumericValue('housing-saving'));
    const housingRent = Math.max(0, getNumericValue('housing-rent'));
    const housingLoan = Math.max(0, getNumericValue('housing-loan'));

    let nationalPension = getNumericValue('national-pension');
    let healthInsurance = getNumericValue('health-insurance');

    // 세액공제 지출 항목
    const pensionSaving = Math.max(0, getNumericValue('pension-saving'));
    const irpSaving = Math.max(0, getNumericValue('irp-saving'));
    const insuranceNormal = Math.max(0, getNumericValue('insurance-normal'));
    const insuranceDisabled = Math.max(0, getNumericValue('insurance-disabled'));
    const medicalSpecial = Math.max(0, getNumericValue('medical-special'));
    const medicalNormal = Math.max(0, getNumericValue('medical-normal'));
    const educationSelf = Math.max(0, getNumericValue('education-self'));
    const educationDependents = Math.max(0, getNumericValue('education-dependents'));
    const donation = Math.max(0, getNumericValue('donation'));
    const monthlyRent = Math.max(0, getNumericValue('monthly-rent'));
    const smeReduction = document.getElementById('sme-tax-reduction').value || 'none';

    // ----------------------------------------
    // [2] 근로소득공제 및 소득금액 산출
    // ----------------------------------------
    let earnedIncomeDeduction = 0;
    if (grossIncome <= 5000000) {
        earnedIncomeDeduction = grossIncome * 0.7;
    } else if (grossIncome <= 15000000) {
        earnedIncomeDeduction = 3500000 + (grossIncome - 5000000) * 0.4;
    } else if (grossIncome <= 45000000) {
        earnedIncomeDeduction = 7500000 + (grossIncome - 15000000) * 0.15;
    } else if (grossIncome <= 100000000) {
        earnedIncomeDeduction = 12000000 + (grossIncome - 45000000) * 0.05;
    } else {
        earnedIncomeDeduction = 14750000 + (grossIncome - 100000000) * 0.02;
    }
    let earnedIncomeAmount = Math.max(0, grossIncome - earnedIncomeDeduction);

    // ----------------------------------------
    // [3] 인적공제 계산
    // ----------------------------------------
    let humanDeduction = 0;
    // 기본공제: 본인(150만) + 배우자(150만) + 부양가족(인당 150만)
    let basicDeductionCount = 1 + (hasSpouse ? 1 : 0) + childCount + dependentCount;
    humanDeduction += basicDeductionCount * 1500000;

    // 추가공제
    let additionalDeduction = 0;
    additionalDeduction += elderlyCount * 1000000; // 경로우대 100만
    additionalDeduction += disabledCount * 2000000; // 장애인 200만
    
    // 부녀자공제(50만) vs 한부모공제(100만) -> 중복 시 한부모공제 적용
    if (isSingleParent) {
        additionalDeduction += 1000000;
    } else if (isWomanDeduction && grossIncome <= 30000000) {
        additionalDeduction += 500000;
    }
    humanDeduction += additionalDeduction;

    // ----------------------------------------
    // [4] 공적연금 및 건보/고용보험공제
    // ----------------------------------------
    // 입력 안 되었을 때 자동 계산 적용 (2025/2026 요율: 국민연금 4.5%, 건강/고용 약 4.4%)
    if (isNaN(nationalPension) || document.getElementById('national-pension').value === '') {
        const pensionRate = 0.045;
        // 국민연금은 소득월액 상한액(2025년 기준 월 617만원, 2026년 기준 상향 적용 가능하나 일단 620만원 수준 적용)
        // 월 최대 279,000원 -> 연 최대 3,348,000원 한도 설정
        let autoPension = grossIncome * pensionRate;
        nationalPension = Math.min(autoPension, 3348000);
        document.getElementById('national-pension').placeholder = `자동: ${formatComma(Math.round(nationalPension))}원`;
    } else {
        document.getElementById('national-pension').placeholder = '자동 계산';
    }

    if (isNaN(healthInsurance) || document.getElementById('health-insurance').value === '') {
        const healthRate = 0.03545 + 0.009; // 건강 3.545% + 고용 0.9% (대략 4.445%)
        // 건강보험 등 상한액은 충분히 높으므로 한도 없이 요율 적용
        healthInsurance = grossIncome * healthRate;
        document.getElementById('health-insurance').placeholder = `자동: ${formatComma(Math.round(healthInsurance))}원`;
    } else {
        document.getElementById('health-insurance').placeholder = '자동 계산';
    }
    
    let publicInsuranceDeduction = nationalPension + healthInsurance;

    // ----------------------------------------
    // [5] 신용카드 등 사용금액 소득공제 (2026 개정 적용)
    // ----------------------------------------
    let cardDeduction = 0;
    const cardThreshold = grossIncome * 0.25;
    const totalSpent = cardCredit + cardDebit + cardCash + cardCulture + cardMarket + cardTransit;

    if (totalSpent > cardThreshold) {
        // 문턱을 넘었으므로 공제 가능.
        // 공제 한도 설정 (2026 개정: 자녀 수에 따라 한도 확대)
        let baseLimit = 3000000;
        if (grossIncome <= 70000000) {
            baseLimit = childCount === 1 ? 3500000 : (childCount >= 2 ? 4000000 : 3000000);
        } else {
            baseLimit = childCount === 1 ? 2750000 : (childCount >= 2 ? 3000000 : 2500000);
        }

        // 문턱 채우기 로직 (공제율 낮은 순: 신용카드 15% -> 도서/공연/수영장 30% -> 체크/현금 30% -> 전통시장 40% -> 대중교통 40%)
        let tempThreshold = cardThreshold;
        
        let c_rem = cardCredit;
        let b_rem = cardCulture;
        let d_rem = cardDebit + cardCash;
        let m_rem = cardMarket;
        let p_rem = cardTransit;

        // 1. 신용카드 차감
        let sub = Math.min(tempThreshold, c_rem);
        tempThreshold -= sub; c_rem -= sub;

        // 2. 도서공연/수영장 차감 (7천만 이하만 30% 공제 대상이 됨, 초과는 일반 15%로 처리)
        let cultureRate = (grossIncome <= 70000000) ? 0.3 : 0.15;
        sub = Math.min(tempThreshold, b_rem);
        tempThreshold -= sub; b_rem -= sub;

        // 3. 체크카드/현금영수증 차감 (30%)
        sub = Math.min(tempThreshold, d_rem);
        tempThreshold -= sub; d_rem -= sub;

        // 4. 전통시장 차감 (40%)
        sub = Math.min(tempThreshold, m_rem);
        tempThreshold -= sub; m_rem -= sub;

        // 5. 대중교통 차감 (40%)
        sub = Math.min(tempThreshold, p_rem);
        tempThreshold -= sub; p_rem -= sub;

        // 남은 금액들에 공제율 적용하여 기본 공제액 계산
        let basicCalculated = (c_rem * 0.15) + (b_rem * cultureRate) + (d_rem * 0.3) + (m_rem * 0.4) + (p_rem * 0.4);
        
        // 기본 공제액은 한도를 초과할 수 없음
        let basicDeduction = Math.min(basicCalculated, baseLimit);

        // 추가 공제 계산 (전통시장, 대중교통, 문화/수영장 각각 100만 원 한도로 추가 공제)
        let cultureAdd = 0;
        if (grossIncome <= 70000000) {
            cultureAdd = Math.min(b_rem * 0.3, 1000000);
        }
        let marketAdd = Math.min(m_rem * 0.4, 1000000);
        let transitAdd = Math.min(p_rem * 0.4, 1000000);

        cardDeduction = basicDeduction + cultureAdd + marketAdd + transitAdd;
    }

    // ----------------------------------------
    // [6] 주택자금 및 기타 소득공제
    // ----------------------------------------
    let housingDeduction = 0;
    // 청약저축: 총급여 7천만 원 이하 무주택 세대주/배우자, 납입액(연 300만 한도)의 40%
    let housingSavingDeduction = 0;
    if (grossIncome <= 70000000) {
        housingSavingDeduction = Math.min(housingSaving, 3000000) * 0.4;
    }
    // 주택임차차입금: 원리금의 40% (청약저축 공제액과 합산 연 400만 원 한도)
    let rentDeduction = housingRent * 0.4;
    let rentSavingSum = Math.min(housingSavingDeduction + rentDeduction, 4000000);

    // 장기주택저당차입금 이자상환액: 최대 2,000만 원 한도
    let loanDeduction = Math.min(housingLoan, 20000000);

    housingDeduction = rentSavingSum + loanDeduction;

    // 소득공제 총합
    let totalDeductions = humanDeduction + publicInsuranceDeduction + cardDeduction + housingDeduction;
    
    // 과세표준 결정
    let taxableIncome = Math.max(0, earnedIncomeAmount - totalDeductions);

    // ----------------------------------------
    // [7] 산출세액 계산 (2026년 과세표준 구간 반영)
    // ----------------------------------------
    let calculatedTax = 0;
    if (taxableIncome <= 14000000) {
        calculatedTax = taxableIncome * 0.06;
    } else if (taxableIncome <= 50000000) {
        calculatedTax = 14000000 * 0.06 + (taxableIncome - 14000000) * 0.15;
    } else if (taxableIncome <= 88000000) {
        calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + (taxableIncome - 50000000) * 0.24;
    } else if (taxableIncome <= 150000000) {
        calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + 38000000 * 0.24 + (taxableIncome - 88000000) * 0.35;
    } else if (taxableIncome <= 300000000) {
        calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + 38000000 * 0.24 + 62000000 * 0.35 + (taxableIncome - 150000000) * 0.38;
    } else if (taxableIncome <= 500000000) {
        calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + 38000000 * 0.24 + 62000000 * 0.35 + 150000000 * 0.38 + (taxableIncome - 300000000) * 0.40;
    } else if (taxableIncome <= 1000000000) {
        calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + 38000000 * 0.24 + 62000000 * 0.35 + 150000000 * 0.38 + 200000000 * 0.40 + (taxableIncome - 500000000) * 0.42;
    } else {
        calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + 38000000 * 0.24 + 62000000 * 0.35 + 150000000 * 0.38 + 200000000 * 0.40 + 500000000 * 0.42 + (taxableIncome - 1000000000) * 0.45;
    }

    // ----------------------------------------
    // [8] 세액공제 계산
    // ----------------------------------------
    let taxCredits = 0;

    // 1. 근로소득세액공제
    let laborTaxCredit = 0;
    if (calculatedTax <= 1300000) {
        laborTaxCredit = calculatedTax * 0.55;
    } else {
        laborTaxCredit = 715000 + (calculatedTax - 1300000) * 0.30;
    }
    // 근로소득세액공제 한도 적용
    let laborCreditLimit = 740000;
    if (grossIncome <= 33000000) {
        laborCreditLimit = 740000;
    } else if (grossIncome <= 70000000) {
        laborCreditLimit = Math.max(660000, 740000 - (grossIncome - 33000000) * 0.008);
    } else if (grossIncome <= 120000000) {
        laborCreditLimit = Math.max(500000, 660000 - (grossIncome - 70000000) * 0.005);
    } else {
        laborCreditLimit = Math.max(200000, 500000 - (grossIncome - 120000000) * 0.005);
    }
    laborTaxCredit = Math.min(laborTaxCredit, laborCreditLimit);
    taxCredits += laborTaxCredit;

    // 2. 자녀세액공제 (2026년 개정: 자녀당 10만원씩 상향)
    let childTaxCredit = 0;
    if (childCount === 1) {
        childTaxCredit = 250000;
    } else if (childCount === 2) {
        childTaxCredit = 550000;
    } else if (childCount >= 3) {
        childTaxCredit = 550000 + (childCount - 2) * 400000;
    }
    // 자녀 추가 혜택 (출산/입양): 사용자가 필요한 경우 직접 입력(출산 관련 항목은 생략하고 단순화하여 적용 필요하면 자녀수에 합산)
    taxCredits += childTaxCredit;

    // 3. 연금계좌세액공제
    // 연금저축한도 600만, 합산한도 900만
    let validPensionSaving = Math.min(pensionSaving, 6000000);
    let validPensionSum = Math.min(validPensionSaving + irpSaving, 9000000);
    // 공제율 결정: 총급여 5,500만 원 이하 15%, 초과 12%
    let pensionRate = (grossIncome <= 55000000) ? 0.15 : 0.12;
    let pensionTaxCredit = validPensionSum * pensionRate;
    taxCredits += pensionTaxCredit;

    // 4. 특별세액공제 - 보장성보험
    // 일반보험 한도 100만(12%), 장애인보험 한도 100만(15%)
    let insNormalCredit = Math.min(insuranceNormal, 1000000) * 0.12;
    let insDisabledCredit = Math.min(insuranceDisabled, 1000000) * 0.15;
    taxCredits += (insNormalCredit + insDisabledCredit);

    // 5. 특별세액공제 - 의료비
    // 특정의료비(한도없음, 난임시술 30%, 미숙아 20%, 본인 등 15%) + 일반의료비(한도 700만, 15%)
    // 총급여 3% 초과분만 공제 대상
    let medicalThreshold = grossIncome * 0.03;
    let totalMedical = medicalSpecial + medicalNormal;
    let medicalCredit = 0;

    if (totalMedical > medicalThreshold) {
        let overAmount = totalMedical - medicalThreshold;
        // 일반 의료비부터 문턱(3%)을 깎아나가는 것이 공제에 유리함.
        if (medicalNormal >= medicalThreshold) {
            // 일반 의료비만으로 문턱이 충족되는 경우
            let normalOver = medicalNormal - medicalThreshold;
            let normalDeduct = Math.min(normalOver, 7000000);
            medicalCredit = (normalDeduct * 0.15) + (medicalSpecial * 0.15); // 난임/미숙아 세부입력 부재로 일반 특정의료비 15% 적용
        } else {
            // 특정 의료비에서도 문턱을 일부 깎아야 하는 경우
            let specificOver = medicalSpecial - (medicalThreshold - medicalNormal);
            medicalCredit = specificOver * 0.15;
        }
    }
    taxCredits += medicalCredit;

    // 6. 특별세액공제 - 교육비
    // 본인 교육비 전액 + 부양가족 교육비(취학전/초중고 300만 한도, 대학생 900만 한도)에 대해 15% 세액공제
    let educationCredit = (educationSelf + educationDependents) * 0.15;
    taxCredits += educationCredit;

    // 7. 기부금 세액공제 (10만 원 이하 90.9% 적용, 1천만 원 이하 15%, 1천만 원 초과 30% 세액공제)
    let donationCredit = 0;
    if (donation <= 100000) {
        donationCredit = donation * 100 / 110;
    } else {
        let overTen = donation - 100000;
        let baseDonationCredit = 100000 * 100 / 110;
        if (overTen <= 10000000) {
            donationCredit = baseDonationCredit + overTen * 0.15;
        } else {
            donationCredit = baseDonationCredit + 10000000 * 0.15 + (overTen - 10000000) * 0.30;
        }
    }
    taxCredits += donationCredit;

    // 8. 월세 세액공제 (2026 기준: 연 1,000만 원 한도)
    let rentCredit = 0;
    if (grossIncome <= 70000000 && monthlyRent > 0) {
        let validMonthlyRent = Math.min(monthlyRent, 10000000);
        let rentRate = (grossIncome <= 55000000) ? 0.17 : 0.15;
        rentCredit = validMonthlyRent * rentRate;
    }
    taxCredits += rentCredit;

    // ----------------------------------------
    // [8.5] 표준세액공제(13만 원) 비교 및 적용 결정
    // ----------------------------------------
    // 특별소득공제(주택자금) 및 특별세액공제(보장성보험, 의료비, 교육비, 기부금 10만 초과분, 월세) 금액 합산
    let specialDeduction = housingDeduction;
    let specialTaxCredits = insNormalCredit + insDisabledCredit + medicalCredit + educationCredit + (donation > 100000 ? (donation - 100000) * 0.15 : 0) + rentCredit;

    // 해당 과세표준 구간의 한계세율 판정
    let marginalRate = 0.06;
    if (taxableIncome > 1000000000) marginalRate = 0.45;
    else if (taxableIncome > 500000000) marginalRate = 0.42;
    else if (taxableIncome > 300000000) marginalRate = 0.40;
    else if (taxableIncome > 150000000) marginalRate = 0.38;
    else if (taxableIncome > 88000000) marginalRate = 0.35;
    else if (taxableIncome > 50000000) marginalRate = 0.24;
    else if (taxableIncome > 14000000) marginalRate = 0.15;

    // 특별공제에 의한 절세 효과 금액 산출
    let specialBenefit = (specialDeduction * marginalRate) + specialTaxCredits;
    let useStandardCredit = false;

    if (specialBenefit < 130000) {
        // 특별공제 포기하고 표준세액공제 13만 원을 선택하는 것이 이득인 경우
        useStandardCredit = true;
        
        // 특별소득공제 배제하고 과세표준 재계산
        let correctedDeductions = humanDeduction + publicInsuranceDeduction + cardDeduction; // 주택자금 제외
        let correctedTaxable = Math.max(0, earnedIncomeAmount - correctedDeductions);
        
        // 산출세액 재계산
        if (correctedTaxable <= 14000000) {
            calculatedTax = correctedTaxable * 0.06;
        } else if (correctedTaxable <= 50000000) {
            calculatedTax = 14000000 * 0.06 + (correctedTaxable - 14000000) * 0.15;
        } else if (correctedTaxable <= 88000000) {
            calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + (correctedTaxable - 50000000) * 0.24;
        } else if (correctedTaxable <= 150000000) {
            calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + 38000000 * 0.24 + (correctedTaxable - 88000000) * 0.35;
        } else {
            calculatedTax = 14000000 * 0.06 + 36000000 * 0.15 + 38000000 * 0.24 + 62000000 * 0.35 + (correctedTaxable - 150000000) * 0.38;
        }

        // 특별세액공제 모두 배제하고, 대신 근로소득세액공제 + 자녀세액공제 + 정치기부금(10만 이하) + 표준세액공제(13만) 적용
        let limitDonationCredit = donation <= 100000 ? donation * 100 / 110 : 100000 * 100 / 110;
        taxCredits = laborTaxCredit + childTaxCredit + limitDonationCredit + 130000;
    }

    // ----------------------------------------
    // [8.7] 중소기업 취업자 소득세 감면 적용
    // ----------------------------------------
    let smeReductionAmount = 0;
    if (smeReduction === 'youth') {
        // 청년 감면: 90% 감면, 연 200만 원 한도
        smeReductionAmount = Math.min(calculatedTax * 0.9, 2000000);
    } else if (smeReduction === 'other') {
        // 일반 감면: 70% 감면, 연 150만 원 한도
        smeReductionAmount = Math.min(calculatedTax * 0.7, 1500000);
    }

    // ----------------------------------------
    // [9] 결정세액 및 최종 환급/납부액 확정
    // ----------------------------------------
    let decidedTax = Math.max(0, calculatedTax - taxCredits - smeReductionAmount);
    
    // 기납부세액과 비교하여 최종 환급/납부세액 계산
    let finalDiff = prepaidTax - decidedTax; // 양수면 환급, 음수면 추가 납부

    // 지방소득세 10% 효과 포함한 최종 체감액 계산
    let displayDiff = finalDiff;
    if (finalDiff > 0) {
        // 환급 시 지방소득세도 10% 추가 환급됨
        displayDiff = finalDiff * 1.1;
    } else {
        // 납부 시 지방소득세도 10% 추가 납부됨
        displayDiff = finalDiff * 1.1;
    }

    // ----------------------------------------
    // [10] UI 렌더링 업데이트
    // ----------------------------------------
    updateUI(grossIncome, totalDeductions, taxableIncome, taxCredits, decidedTax, prepaidTax, displayDiff);
}

/* ==========================================
   3. UI 렌더링 및 동적 차트 & 절세 팁
   ========================================== */

function updateUI(gross, deductions, taxable, credits, decided, prepaid, diff) {
    const finalResultVal = document.getElementById('final-result-val');
    const finalResultKorean = document.getElementById('final-result-korean');
    const resultStatus = document.getElementById('result-status');
    const resultBox = document.getElementById('result-box');
    const gaugeBar = document.getElementById('gauge-bar');

    // 결정세액, 기납부세액 텍스트 업데이트 (소득세 기준)
    document.getElementById('decided-tax-val').innerText = `${formatComma(Math.round(decided))} 원`;
    document.getElementById('prepaid-tax-val').innerText = `${formatComma(Math.round(prepaid))} 원`;

    // 텍스트 라벨 매핑 (지방소득세 포함 총 환급/납부액 기준)
    const absDiff = Math.abs(Math.round(diff));
    finalResultVal.innerText = formatComma(absDiff);
    finalResultKorean.innerText = `${formatKoreanNumber(absDiff)} (지방소득세 10% 포함)`;

    if (diff > 0) {
        // 환급
        resultStatus.innerText = '돌려받을 환급액';
        finalResultVal.className = 'amount-value refund';
        resultBox.style.borderTop = '4px solid var(--success)';
        
        // 게이지 바 업데이트 (최대 300만원 환급 시 100% 채움)
        let percent = Math.min(50 + (diff / 3000000) * 50, 100);
        gaugeBar.style.left = '50%';
        gaugeBar.style.width = `${percent - 50}%`;
        gaugeBar.style.background = 'var(--success)';
    } else if (diff < 0) {
        // 납부
        resultStatus.innerText = '추가 납부할 세액';
        finalResultVal.className = 'amount-value pay';
        resultBox.style.borderTop = '4px solid var(--danger)';
        
        // 게이지 바 업데이트 (최대 300만원 납부 시 0%로 줄어듦)
        let percent = Math.min(Math.abs(diff) / 3000000 * 50, 50);
        gaugeBar.style.left = `${50 - percent}%`;
        gaugeBar.style.width = `${percent}%`;
        gaugeBar.style.background = 'var(--danger)';
    } else {
        // 균형
        resultStatus.innerText = '납부/환급액 없음';
        finalResultVal.className = 'amount-value';
        resultBox.style.borderTop = '1px solid var(--border-color)';
        gaugeBar.style.left = '50%';
        gaugeBar.style.width = '0%';
    }

    // 흐름 상세 레이블 업데이트
    document.getElementById('lbl-gross').innerText = `${formatComma(Math.round(gross))}원`;
    document.getElementById('lbl-deduction').innerText = `-${formatComma(Math.round(deductions))}원`;
    document.getElementById('lbl-taxable').innerText = `${formatComma(Math.round(taxable))}원`;
    document.getElementById('lbl-tax-credit').innerText = `-${formatComma(Math.round(credits))}원`;
    document.getElementById('lbl-decided').innerText = `${formatComma(Math.round(decided))}원`;

    // 동적 차트 & 절세 팁 제공
    renderFlowChart(gross, deductions, taxable, credits, decided);
    generateSavingsTips(gross, decided);
}

// SVG 기반 연말정산 흐름 분석 그래프 그리기
function renderFlowChart(gross, deductions, taxable, credits, decided) {
    const svg = document.getElementById('tax-flow-svg');
    svg.innerHTML = ''; // 초기화

    if (gross <= 0) {
        svg.innerHTML = '<text x="160" y="90" text-anchor="middle" fill="var(--text-muted)" font-size="12">총급여액을 입력하면 분석 차트가 활성화됩니다.</text>';
        return;
    }

    // 라이트/다크 모드에 따른 텍스트 컬러 설정
    const isDark = document.body.classList.contains('dark-mode');
    const textCol = isDark ? '#cbd5e1' : '#334155';
    const textMutedCol = isDark ? '#64748b' : '#94a3b8';

    // 1. 소득 및 소득공제 막대 (상단)
    // 2. 세액 및 세액공제 막대 (하단)
    
    // 차트 크기 정의
    const w = 320;
    const h = 180;
    const barWidth = 260;
    const barHeight = 20;
    const startX = 30;
    
    // 비율 계산
    let dedPercent = gross > 0 ? deductions / gross : 0;
    let taxPercent = gross > 0 ? taxable / gross : 0;
    
    // 극단적인 수치 제한
    if (dedPercent > 1) dedPercent = 1;
    let dedW = barWidth * dedPercent;
    let taxW = barWidth * (1 - dedPercent);

    // [상단 바 그리기 - 소득 차감 바]
    // 1. 소득공제 영역 (Red)
    const rectDed = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectDed.setAttribute("x", startX);
    rectDed.setAttribute("y", 40);
    rectDed.setAttribute("width", Math.max(1, dedW));
    rectDed.setAttribute("height", barHeight);
    rectDed.setAttribute("fill", "var(--danger)");
    rectDed.setAttribute("rx", 4);
    svg.appendChild(rectDed);

    // 2. 과세표준 영역 (Warning)
    const rectTaxable = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectTaxable.setAttribute("x", startX + dedW);
    rectTaxable.setAttribute("y", 40);
    rectTaxable.setAttribute("width", Math.max(1, taxW));
    rectTaxable.setAttribute("height", barHeight);
    rectTaxable.setAttribute("fill", "var(--warning)");
    rectTaxable.setAttribute("rx", 4);
    svg.appendChild(rectTaxable);

    // 라벨 1: 소득 공제 바 타이틀
    const textTitle1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textTitle1.setAttribute("x", startX);
    textTitle1.setAttribute("y", 30);
    textTitle1.setAttribute("fill", textCol);
    textTitle1.setAttribute("font-size", "10");
    textTitle1.setAttribute("font-weight", "700");
    textTitle1.textContent = "소득 대비 소득공제 비율";
    svg.appendChild(textTitle1);

    // 라벨 2: 수치 표시
    const textVal1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textVal1.setAttribute("x", startX + barWidth);
    textVal1.setAttribute("y", 30);
    textVal1.setAttribute("fill", textMutedCol);
    textVal1.setAttribute("font-size", "10");
    textVal1.setAttribute("text-anchor", "end");
    textVal1.textContent = `소득공제 ${Math.round(dedPercent * 100)}%`;
    svg.appendChild(textVal1);


    // [하단 바 그리기 - 세액 차감 바]
    // 산출세액 기준 세액공제 비율 그리기
    let calculatedTaxVal = decided + credits;
    let creditPercent = calculatedTaxVal > 0 ? credits / calculatedTaxVal : 0;
    if (creditPercent > 1) creditPercent = 1;

    let creditW = barWidth * creditPercent;
    let decidedW = barWidth * (1 - creditPercent);

    // 3. 세액공제 영역 (Green)
    const rectCredit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectCredit.setAttribute("x", startX);
    rectCredit.setAttribute("y", 110);
    rectCredit.setAttribute("width", Math.max(1, creditW));
    rectCredit.setAttribute("height", barHeight);
    rectCredit.setAttribute("fill", "var(--success)");
    rectCredit.setAttribute("rx", 4);
    svg.appendChild(rectCredit);

    // 4. 결정세액 영역 (Purple/Blue)
    const rectDecided = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectDecided.setAttribute("x", startX + creditW);
    rectDecided.setAttribute("y", 110);
    rectDecided.setAttribute("width", Math.max(1, decidedW));
    rectDecided.setAttribute("height", barHeight);
    rectDecided.setAttribute("fill", "#6366f1");
    rectDecided.setAttribute("rx", 4);
    svg.appendChild(rectDecided);

    // 라벨 3: 세액 공제 바 타이틀
    const textTitle2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textTitle2.setAttribute("x", startX);
    textTitle2.setAttribute("y", 100);
    textTitle2.setAttribute("fill", textCol);
    textTitle2.setAttribute("font-size", "10");
    textTitle2.setAttribute("font-weight", "700");
    textTitle2.textContent = "산출세액 대비 세액공제 비율";
    svg.appendChild(textTitle2);

    // 라벨 4: 수치 표시
    const textVal2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textVal2.setAttribute("x", startX + barWidth);
    textVal2.setAttribute("y", 100);
    textVal2.setAttribute("fill", textMutedCol);
    textVal2.setAttribute("font-size", "10");
    textVal2.setAttribute("text-anchor", "end");
    textVal2.textContent = calculatedTaxVal > 0 ? `세액공제 ${Math.round(creditPercent * 100)}%` : '산출세액 없음';
    svg.appendChild(textVal2);

    // 하단 컬러 범례(Legend) 및 설명
    const textNote = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textNote.setAttribute("x", w / 2);
    textNote.setAttribute("y", 160);
    textNote.setAttribute("fill", textMutedCol);
    textNote.setAttribute("font-size", "9");
    textNote.setAttribute("text-anchor", "middle");
    textNote.textContent = "* 붉은색/녹색 영역이 길수록 세금 환급에 유리합니다.";
    svg.appendChild(textNote);
}

// 스마트 절세 솔루션 생성 엔진
function generateSavingsTips(gross, decided) {
    const tipsContainer = document.getElementById('tips-list-container');
    tipsContainer.innerHTML = ''; // 초기화

    if (gross <= 0) {
        tipsContainer.innerHTML = '<li>소득을 먼저 입력하시면 맞춤 절세 팁을 제공합니다.</li>';
        return;
    }

    const tips = [];

    // 1. 신용카드 최저 사용량 도달 점검
    const cardCredit = Math.max(0, getNumericValue('card-credit'));
    const cardDebit = Math.max(0, getNumericValue('card-debit'));
    const cardCash = Math.max(0, getNumericValue('card-cash'));
    const cardCulture = Math.max(0, getNumericValue('card-culture'));
    const cardMarket = Math.max(0, getNumericValue('card-market'));
    const cardTransit = Math.max(0, getNumericValue('card-transit'));
    
    const totalCardSpent = cardCredit + cardDebit + cardCash + cardCulture + cardMarket + cardTransit;
    const threshold = gross * 0.25;

    if (totalCardSpent < threshold) {
        const gap = Math.round(threshold - totalCardSpent);
        tips.push(`신용카드 등 총 사용액이 문턱(총급여의 25%, **${formatComma(Math.round(threshold))}원**)에 미달했습니다. **${formatComma(gap)}원** 이상을 체크카드나 신용카드로 추가 소비하셔야 소득공제를 적용받을 수 있습니다.`);
    } else {
        tips.push(`신용카드 문턱(25%)을 통과했습니다! 앞으로의 소비는 공제율이 높은 **체크카드(30%)**나 **전통시장(40%)**을 적극 활용하는 것이 유리합니다.`);
    }

    // 2. 연금저축 및 IRP 세액공제 유도
    const pensionSaving = Math.max(0, getNumericValue('pension-saving'));
    const irpSaving = Math.max(0, getNumericValue('irp-saving'));
    const pensionLimit = 6000000;
    const totalLimit = 9000000;
    
    const pensionGap = Math.max(0, pensionLimit - pensionSaving);
    const irpGap = Math.max(0, totalLimit - (pensionSaving + irpSaving));
    const pensionRate = (gross <= 55000000) ? 0.165 : 0.132; // 지방소득세 10% 포함 실질 공제율

    if (decided > 0) {
        if (pensionGap > 0) {
            const addedRefund = Math.min(decided, pensionGap * pensionRate);
            if (addedRefund > 10000) {
                tips.push(`**연금저축** 납입액을 한도까지 **${formatComma(pensionGap)}원** 채우시면 추가로 최대 **${formatComma(Math.round(addedRefund))}원**(지방세 포함)을 더 환급받으실 수 있습니다.`);
            }
        }
        if (irpGap > 0 && irpGap !== pensionGap) {
            const addedRefund = Math.min(decided, irpGap * pensionRate);
            if (addedRefund > 10000) {
                tips.push(`**퇴직연금(IRP)**을 포함한 총 연금계좌 납입액을 **${formatComma(irpGap)}원** 추가 납입하시면 추가로 최대 **${formatComma(Math.round(addedRefund))}원**을 더 환급받으실 수 있습니다.`);
            }
        }
    }

    // 3. 주택청약종합저축 (7천만원 이하 무주택자)
    const housingSaving = Math.max(0, getNumericValue('housing-saving'));
    if (gross <= 70000000 && housingSaving === 0) {
        tips.push(`총급여 7천만 원 이하 무주택 세대주/배우자이시라면 **주택청약저축** 납입액의 40%(연 300만 원 납입 한도 시 최대 120만 원)를 소득공제 받을 수 있습니다.`);
    }

    // 4. 결정세액이 0인 경우에 대한 안내
    if (decided === 0) {
        tips.push(`현재 결정세액이 **0원**입니다. 이미 낸 소득세 전체를 전액 환급받을 예정이므로 추가적인 공제 상품에 가입할 실익이 없습니다.`);
    }

    // 결과 출력
    if (tips.length > 0) {
        tips.forEach(tip => {
            const li = document.createElement('li');
            // 마크다운 형태(**강조**) 지원
            li.innerHTML = tip.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            tipsContainer.appendChild(li);
        });
    } else {
        tipsContainer.innerHTML = '<li>축하합니다! 완벽한 세무 포트폴리오를 보유하고 있습니다.</li>';
    }
}

/* ==========================================
   4. 다중 사용자 프로필 관리 엔진
   ========================================== */

let users = [];
let currentUserId = 'default';

// 사용자 데이터 저장용 입력 필드 ID 목록
const inputIds = [
    'gross-income', 'prepaid-tax', 'sme-tax-reduction', 'spouse-deduction', 'child-count', 'dependents-count',
    'elderly-count', 'disabled-count', 'woman-deduction', 'single-parent-deduction',
    'card-credit', 'card-debit', 'card-cash', 'card-culture', 'card-market', 'card-transit',
    'housing-saving', 'housing-rent', 'housing-loan', 'national-pension', 'health-insurance',
    'pension-saving', 'irp-saving', 'insurance-normal', 'insurance-disabled', 'medical-special',
    'medical-normal', 'education-self', 'education-dependents', 'donation', 'monthly-rent'
];

function initUsers() {
    const storedUsers = localStorage.getItem('tax_users');
    const storedCurrent = localStorage.getItem('tax_current_user');

    if (storedUsers) {
        users = JSON.parse(storedUsers);
    } else {
        // 초기 기본 사용자 생성
        users = [{
            id: 'default',
            name: '기본 사용자',
            data: {}
        }];
        localStorage.setItem('tax_users', JSON.stringify(users));
    }

    if (storedCurrent && users.some(u => u.id === storedCurrent)) {
        currentUserId = storedCurrent;
    } else {
        currentUserId = users[0].id;
        localStorage.setItem('tax_current_user', currentUserId);
    }

    // 새 사용자 추가 이벤트 연결
    document.getElementById('add-user-btn').addEventListener('click', addUser);
    document.getElementById('new-user-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addUser();
    });

    // 원천징수 비율 라디오 변경 감지
    document.querySelectorAll('input[name="withholding-rate"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const gross = getNumericValue('gross-income');
            if (gross > 0) {
                autoFillPrepaidTax();
            }
            saveCurrentUserData();
        });
    });

    renderUserList();
    loadUserData(currentUserId);
}

function renderUserList() {
    const listContainer = document.getElementById('user-list');
    listContainer.innerHTML = '';

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = `user-profile-item ${user.id === currentUserId ? 'active' : ''}`;
        
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-profile')) return;
            selectUser(user.id);
        });

        const info = document.createElement('div');
        info.className = 'user-profile-info';
        info.innerHTML = `<i class="fa-solid fa-user"></i> <span>${user.name}</span>`;
        item.appendChild(info);

        if (users.length > 1) {
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete-profile';
            delBtn.setAttribute('title', '사용자 삭제');
            delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            delBtn.addEventListener('click', () => {
                deleteUser(user.id);
            });
            item.appendChild(delBtn);
        }

        listContainer.appendChild(item);
    });
}

function selectUser(id) {
    saveCurrentUserData();
    currentUserId = id;
    localStorage.setItem('tax_current_user', id);
    loadUserData(id);
    renderUserList();
}

function addUser() {
    const nameInput = document.getElementById('new-user-name');
    const name = nameInput.value.trim();
    if (!name) {
        alert('이름을 입력해주세요.');
        return;
    }

    const newId = 'user_' + Date.now();
    const newUser = {
        id: newId,
        name: name,
        data: {}
    };

    users.push(newUser);
    localStorage.setItem('tax_users', JSON.stringify(users));

    nameInput.value = '';
    selectUser(newId);
}

function deleteUser(id) {
    if (users.length <= 1) {
        alert('최소 한 명의 사용자는 존재해야 합니다.');
        return;
    }

    if (!confirm('해당 사용자의 모든 연말정산 데이터가 영구 삭제됩니다. 계속하시겠습니까?')) {
        return;
    }

    users = users.filter(u => u.id !== id);
    localStorage.setItem('tax_users', JSON.stringify(users));

    if (currentUserId === id) {
        currentUserId = users[0].id;
        localStorage.setItem('tax_current_user', currentUserId);
        loadUserData(currentUserId);
    } else {
        renderUserList();
    }
}

function saveCurrentUserData() {
    const userIndex = users.findIndex(u => u.id === currentUserId);
    if (userIndex === -1) return;

    const data = {};
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        if (el.type === 'checkbox') {
            data[id] = el.checked;
        } else {
            data[id] = el.value;
        }
    });

    // 원천징수 비율도 데이터에 저장
    const rateEl = document.querySelector('input[name="withholding-rate"]:checked');
    data['withholding-rate'] = rateEl ? rateEl.value : '1.0';

    users[userIndex].data = data;
    localStorage.setItem('tax_users', JSON.stringify(users));
}

function loadUserData(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;

    const data = user.data || {};

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const val = data[id];
        if (el.type === 'checkbox') {
            el.checked = val === undefined ? false : val;
        } else {
            el.value = val === undefined ? '' : val;
        }
        triggerInputChange(el);
    });

    // 원천징수 비율 복원
    const rate = data['withholding-rate'] || '1.0';
    const rateEl = document.querySelector(`input[name="withholding-rate"][value="${rate}"]`);
    if (rateEl) {
        rateEl.checked = true;
    }

    calculateTax();
}
