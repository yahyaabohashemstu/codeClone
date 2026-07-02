import java.util.ArrayList;
import java.util.List;

public class T2AddingMachine {

    public int add(String expr) {
        if (expr == null || expr.trim().isEmpty()) {
            return 0;
        }
        List<Integer> values = split(expr);
        int sum = 0;
        for (int n : values) {
            if (n < 0) {
                throw new IllegalArgumentException("negatives not allowed: " + n);
            }
            if (n <= 1000) {
                sum += n;
            }
        }
        return sum;
    }

    private List<Integer> split(String expr) {
        String payload = expr;
        String sep = ",|\n";
        if (expr.startsWith("//")) {
            int nl = expr.indexOf('\n');
            sep = java.util.regex.Pattern.quote(expr.substring(2, nl));
            payload = expr.substring(nl + 1);
        }
        List<Integer> values = new ArrayList<>();
        for (String chunk : payload.split(sep)) {
            if (!chunk.trim().isEmpty()) {
                values.add(Integer.parseInt(chunk.trim()));
            }
        }
        return values;
    }
}
