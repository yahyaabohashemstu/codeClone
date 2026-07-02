import java.util.ArrayList;
import java.util.List;

public class HardTemperatureLogger {

    private final String sensorId;
    private final List<Double> readings = new ArrayList<>();
    private double alertThreshold;

    public HardTemperatureLogger(String sensorId, double alertThreshold) {
        this.sensorId = sensorId;
        this.alertThreshold = alertThreshold;
    }

    public boolean record(double celsius) {
        if (celsius < -90.0 || celsius > 60.0) {
            throw new IllegalArgumentException("reading outside physical range");
        }
        readings.add(celsius);
        return celsius >= alertThreshold;
    }

    public double average() {
        if (readings.isEmpty()) {
            return Double.NaN;
        }
        double sum = 0.0;
        for (double reading : readings) {
            sum += reading;
        }
        return sum / readings.size();
    }

    public double maximum() {
        double best = Double.NEGATIVE_INFINITY;
        for (double reading : readings) {
            if (reading > best) {
                best = reading;
            }
        }
        return best;
    }

    public int alertCount() {
        int count = 0;
        for (double reading : readings) {
            if (reading >= alertThreshold) {
                count++;
            }
        }
        return count;
    }
}
