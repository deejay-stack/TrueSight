import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.lang.model.element.Modifier;
import javax.tools.*;
import com.sun.source.tree.*;
import com.sun.source.util.JavacTask;

// Only parses/compiles. Annotation processors are disabled; student classes never run.
public class JavaDiagnostics {
  static boolean identifier(String text) {
    if(text.isEmpty()||!Character.isJavaIdentifierStart(text.codePointAt(0)))return false;
    return text.codePoints().skip(1).allMatch(Character::isJavaIdentifierPart);
  }
  static class Source extends SimpleJavaFileObject {
    final String text;
    Source(String name, String text) { super(URI.create("string:///" + name.replace('.', '/') + ".java"), Kind.SOURCE); this.text=text; }
    public CharSequence getCharContent(boolean ignore) { return text; }
  }
  static String quote(String text) {
    StringBuilder out=new StringBuilder("\"");
    for(char ch:text.toCharArray()) switch(ch) {
      case '\\': out.append("\\\\"); break;
      case '"': out.append("\\\""); break;
      case '\n': out.append("\\n"); break;
      case '\r': out.append("\\r"); break;
      case '\t': out.append("\\t"); break;
      default: if(ch<32)out.append(String.format("\\u%04x",(int)ch));else out.append(ch);
    }
    return out.append('"').toString();
  }
  public static void main(String[] args) throws Exception {
    String text=new String(System.in.readNBytes(100001),StandardCharsets.UTF_8);
    JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();
    if(compiler==null)throw new IllegalStateException("A JDK is required for Java diagnostics.");
    Path workspace=Path.of(args[0]);
    List<String> options=List.of("-proc:none","-classpath",workspace.toString(),"-sourcepath",workspace.toString(),"-d",workspace.toString(),"-encoding","UTF-8","-Xlint:all");
    String className="Submission",packageName="";
    try(StandardJavaFileManager files=compiler.getStandardFileManager(null,Locale.ENGLISH,StandardCharsets.UTF_8)) {
      JavacTask parser=(JavacTask)compiler.getTask(new StringWriter(),files,d->{},options,null,List.of(new Source(className,text)));
      for(CompilationUnitTree unit:parser.parse()) {
        if(unit.getPackageName()!=null){String candidate=unit.getPackageName().toString();if(Arrays.stream(candidate.split("\\.")).allMatch(JavaDiagnostics::identifier))packageName=candidate;}
        for(Tree type:unit.getTypeDecls()) if(type instanceof ClassTree c && c.getModifiers().getFlags().contains(Modifier.PUBLIC)) { String candidate=c.getSimpleName().toString();if(identifier(candidate))className=candidate;break; }
      }
    }
    DiagnosticCollector<JavaFileObject> diagnostics=new DiagnosticCollector<>();
    try(StandardJavaFileManager files=compiler.getStandardFileManager(diagnostics,Locale.ENGLISH,StandardCharsets.UTF_8)) {
      compiler.getTask(new StringWriter(),files,diagnostics,options,null,List.of(new Source((packageName.isEmpty()?"":packageName+".")+className,text))).call();
    }
    StringJoiner result=new StringJoiner(",","{\"diagnostics\":[", "],\"entryClass\":"+quote((packageName.isEmpty()?"":packageName+".")+className)+"}");
    int count=0;
    for(Diagnostic<? extends JavaFileObject> d:diagnostics.getDiagnostics()) {
      if(++count>80)break;
      if(d.getKind()!=Diagnostic.Kind.ERROR&&d.getKind()!=Diagnostic.Kind.WARNING&&d.getKind()!=Diagnostic.Kind.MANDATORY_WARNING)continue;
      long line=Math.max(1,d.getLineNumber()),column=Math.max(1,d.getColumnNumber());
      if(d.getPosition()>=0&&d.getPosition()<=text.length()) {
        int offset=(int)d.getPosition(),before=Math.max(-1,offset-1),start=Math.max(text.lastIndexOf('\n',before),text.lastIndexOf('\r',before))+1;
        column=offset-start+1;
      }
      result.add("{\"line\":"+line+",\"column\":"+column+",\"severity\":"+quote(d.getKind()==Diagnostic.Kind.ERROR?"error":"warning")+",\"message\":"+quote(d.getMessage(Locale.ENGLISH))+",\"code\":"+quote(d.getCode())+",\"source\":\"javac\"}");
    }
    System.out.println(result);
  }
}
