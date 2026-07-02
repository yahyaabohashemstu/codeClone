import java.util.ArrayList;
import java.util.List;

public class StringCalculator {

    public int add(String input) {
        if (input == null || input.trim().isEmpty()) {
            return 0;
        }
        List<Integer> numbers = parse(input);
        int total = 0;
        for (int number : numbers) {
            if (number < 0) {
                throw new IllegalArgumentException("negatives not allowed: " + number);
            }
            if (number <= 1000) {
                total += number;
            }
        }
        return total;
    }

    private List<Integer> parse(String input) {
        String body = input;
        String delimiter = ",|\n";
        if (input.startsWith("//")) {
            int newline = input.indexOf('\n');
            delimiter = java.util.regex.Pattern.quote(input.substring(2, newline));
            body = input.substring(newline + 1);
        }
        List<Integer> numbers = new ArrayList<>();
        for (String part : body.split(delimiter)) {
            if (!part.trim().isEmpty()) {
                numbers.add(Integer.parseInt(part.trim()));
            }
        }
        return numbers;
    }
}
