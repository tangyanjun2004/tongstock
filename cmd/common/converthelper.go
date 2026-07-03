package common

import (
	"strings"

	"github.com/sjzsdu/tongstock/pkg/ta"
)

func OutputIndicatorJSON(code, stockName string, inputs []ta.KlineInput, result *ta.IndicatorResult, days int) map[string]interface{} {
	n := len(inputs)
	if n == 0 {
		return map[string]interface{}{"error": "无数据"}
	}

	if days < 1 {
		days = 1
	}
	if days > n {
		days = n
	}

	startIdx := n - days

	var history []map[string]interface{}
	for i := startIdx; i < n; i++ {
		dayData := inputs[i]
		var change, changePct float64
		if i > 0 {
			change = dayData.Close - inputs[i-1].Close
			if inputs[i-1].Close > 0 {
				changePct = change / inputs[i-1].Close * 100
			}
		}

		trend := CalcTrend(result, i)
		macdSignal := CalcMACDSignal(result, i)
		kdjSignal := CalcKDJSignal(result, i)
		rsiSignal := CalcRSISignal(result, i)
		bollSignal, bollPosition := CalcBOLLSignal(result, dayData, i)

		dayEntry := map[string]interface{}{
			"timestamp": dayData.Time.Format("2006-01-02"),
			"price": map[string]interface{}{
				"current":    dayData.Close,
				"change":     change,
				"change_pct": changePct,
			},
			"ma":      BuildMAData(result, i, trend),
			"macd":    BuildMACDData(result, i, macdSignal),
			"kdj":     BuildKDJData(result, i, kdjSignal),
			"rsi":     BuildRSIData(result, i, rsiSignal),
			"boll":    BuildBOLLData(result, i, bollSignal, bollPosition),
			"signals": BuildSignals(macdSignal, kdjSignal, trend),
		}

		// 如果有成交量数据，添加到每日数据中
		if i == n-1 {
			dayEntry["volume"] = BuildVolumeData(result)
		}

		history = append(history, dayEntry)
	}

	latestTrend := CalcTrend(result, n-1)
	jsonOutput := map[string]interface{}{
		"code":    code,
		"name":    stockName,
		"days":    days,
		"count":   len(history),
		"history": history,
		"summary": BuildSummary(latestTrend),
	}

	return jsonOutput
}

func CalcTrend(result *ta.IndicatorResult, idx int) string {
	if ma5, ok := result.MA["5"]; ok {
		if ma20, ok2 := result.MA["20"]; ok2 && idx >= 0 {
			if ma5[idx] > ma20[idx] {
				return "bullish"
			} else if ma5[idx] < ma20[idx] {
				return "bearish"
			}
		}
	}
	return "neutral"
}

func CalcMACDSignal(result *ta.IndicatorResult, idx int) string {
	if result.MACD != nil && idx >= 0 {
		if result.MACD.DIF[idx] > result.MACD.DEA[idx] {
			return "golden_cross"
		} else if result.MACD.DIF[idx] < result.MACD.DEA[idx] {
			return "death_cross"
		}
	}
	return "neutral"
}

func CalcKDJSignal(result *ta.IndicatorResult, idx int) string {
	if result.KDJ != nil && idx >= 0 {
		if result.KDJ.J[idx] > 100 {
			return "overbought"
		} else if result.KDJ.J[idx] < 0 {
			return "oversold"
		}
	}
	return "neutral"
}

func CalcRSISignal(result *ta.IndicatorResult, idx int) string {
	if rsi6, ok := result.RSI["6"]; ok && idx >= 0 {
		if rsi6[idx] > 80 {
			return "overbought"
		} else if rsi6[idx] < 20 {
			return "oversold"
		}
	}
	return "neutral"
}

func CalcBOLLSignal(result *ta.IndicatorResult, day ta.KlineInput, idx int) (string, float64) {
	signalStr := "normal"
	position := 0.0
	if result.BOLL != nil && idx >= 0 {
		upper := result.BOLL.Upper[idx]
		lower := result.BOLL.Lower[idx]
		if upper > lower {
			position = (day.Close - lower) / (upper - lower)
		}
		if day.Close > upper {
			signalStr = "break_upper"
		} else if day.Close < lower {
			signalStr = "break_lower"
		}
	}
	return signalStr, position
}

func BuildMAData(result *ta.IndicatorResult, idx int, trend string) map[string]interface{} {
	m := map[string]interface{}{"trend": trend}
	for _, p := range []string{"5", "10", "20", "60", "120"} {
		if v, ok := result.MA[p]; ok && idx >= 0 && idx < len(v) {
			m["ma"+p] = v[idx]
		}
	}
	return m
}

func BuildMACDData(result *ta.IndicatorResult, idx int, signalStr string) map[string]interface{} {
	if result.MACD == nil || idx < 0 || idx >= len(result.MACD.DIF) {
		return nil
	}
	return map[string]interface{}{
		"dif":    result.MACD.DIF[idx],
		"dea":    result.MACD.DEA[idx],
		"hist":   result.MACD.Hist[idx],
		"signal": signalStr,
	}
}

func BuildKDJData(result *ta.IndicatorResult, idx int, signalStr string) map[string]interface{} {
	if result.KDJ == nil || idx < 0 || idx >= len(result.KDJ.K) {
		return nil
	}
	return map[string]interface{}{
		"k":      result.KDJ.K[idx],
		"d":      result.KDJ.D[idx],
		"j":      result.KDJ.J[idx],
		"signal": signalStr,
	}
}

func BuildRSIData(result *ta.IndicatorResult, idx int, signalStr string) map[string]interface{} {
	if len(result.RSI) == 0 || idx < 0 {
		return nil
	}
	m := map[string]interface{}{"signal": signalStr}
	for p, v := range result.RSI {
		if idx < len(v) {
			m["rsi"+p] = v[idx]
		}
	}
	return m
}

func BuildBOLLData(result *ta.IndicatorResult, idx int, signalStr string, position float64) map[string]interface{} {
	if result.BOLL == nil || idx < 0 || idx >= len(result.BOLL.Upper) {
		return nil
	}
	return map[string]interface{}{
		"upper":    result.BOLL.Upper[idx],
		"middle":   result.BOLL.Middle[idx],
		"lower":    result.BOLL.Lower[idx],
		"position": position,
		"signal":   signalStr,
	}
}

func BuildVolumeData(result *ta.IndicatorResult) map[string]interface{} {
	if result.VolumeRatio == nil {
		return nil
	}
	return map[string]interface{}{
		"current": result.VolumeRatio.Current,
		"avg5":    result.VolumeRatio.Avg5,
		"ratio":   result.VolumeRatio.Ratio,
		"signal":  result.VolumeRatio.Signal,
	}
}

func BuildSignals(macdSignal, kdjSignal, trend string) []string {
	var s []string
	if macdSignal == "golden_cross" {
		s = append(s, "golden_cross")
	}
	if macdSignal == "death_cross" {
		s = append(s, "death_cross")
	}
	if kdjSignal == "overbought" {
		s = append(s, "overbought")
	}
	if kdjSignal == "oversold" {
		s = append(s, "oversold")
	}
	if trend == "bullish" {
		s = append(s, "多头排列")
	}
	if trend == "bearish" {
		s = append(s, "空头排列")
	}
	return s
}

func BuildSummary(trend string) map[string]interface{} {
	signalStr := "持有"
	if trend == "bullish" {
		signalStr = "买入"
	} else if trend == "bearish" {
		signalStr = "卖出"
	}
	strength := 50
	if trend == "bullish" {
		strength = 70
	} else if trend == "bearish" {
		strength = 30
	}
	return map[string]interface{}{
		"trend":    trend,
		"signal":   signalStr,
		"strength": strength,
	}
}

func ClassifyCode(code string) string {
	// 北交所: 8开头
	if strings.HasPrefix(code, "8") {
		return "北交所股票"
	}
	// 指数: 399开头
	if strings.HasPrefix(code, "399") {
		return "指数"
	}
	// 创业板: 300开头
	if strings.HasPrefix(code, "300") {
		return "创业板"
	}
	// 科创板: 688开头
	if strings.HasPrefix(code, "688") {
		return "科创板"
	}
	// 上证股票: 600/601/603开头
	if strings.HasPrefix(code, "6") {
		return "沪市A股"
	}
	// 深市主板: 000开头
	if strings.HasPrefix(code, "0") {
		return "深市主板"
	}
	// 基金: 1开头
	if strings.HasPrefix(code, "1") {
		return "基金"
	}
	// ETF: 5开头
	if strings.HasPrefix(code, "5") {
		return "ETF"
	}
	// 债券: 2开头
	if strings.HasPrefix(code, "2") {
		return "债券"
	}
	// REITs: 8开头(非北交所)
	if strings.HasPrefix(code, "9") {
		return "REITs"
	}

	return "其他"
}
