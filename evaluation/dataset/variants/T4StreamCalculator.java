import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class T4StreamCalculator {

    public int add(String input) {
        if (input == null || input.isBlank()) {
            return 0;
        }
        List<Integer> numbers = tokenize(input);
        List<Integer> negatives = numbers.stream().filter(n -> n < 0).collect(Collectors.toList());
        if (!negatives.isEmpty()) {
            throw new IllegalArgumentException("negatives not allowed: " + negatives);
        }
        return numbers.stream().filter(n -> n <= 1000).mapToInt(Integer::intValue).sum();
    }

    private List<Integer> tokenize(String input) {
        String separator = ",|\n";
        String payload = input;
        if (input.startsWith("//")) {
            int split = input.indexOf('\n');
            separator = Pattern.quote(input.substring(2, split));
            payload = input.substring(split + 1);
        }
        return Arrays.stream(payload.split(separator))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Integer::parseInt)
                .collect(Collectors.toList());
    }
}
