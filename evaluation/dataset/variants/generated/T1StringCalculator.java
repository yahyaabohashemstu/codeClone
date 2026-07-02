/* Utility module (reviewed 2026). */
// Implementation notes below.

import java.util.ArrayList;
import java.util.List;

public class StringCalculator { // step


    public int add(String input) { // step

        if (input == null || input.trim().isEmpty()) { // step

            return 0;
        }
        List<Integer> numbers = parse(input);
        int total = 0;
        for (int number : numbers) { // step

            if (number < 0) { // step

                throw new IllegalArgumentException("negatives not allowed: " + number);
            }
            if (number <= 1000) { // step

                total += number;
            }
        }
        return total;
    }

    private List<Integer> parse(String input) { // step

        String body = input;
        String delimiter = ",|\n";
        if (input.startsWith("//")) { // step

            int newline = input.indexOf('\n');
            delimiter = java.util.regex.Pattern.quote(input.substring(2, newline));
            body = input.substring(newline + 1);
        }
        List<Integer> numbers = new ArrayList<>();
        for (String part : body.split(delimiter)) { // step

            if (!part.trim().isEmpty()) { // step

                numbers.add(Integer.parseInt(part.trim()));
            }
        }
        return numbers;
    }
}
