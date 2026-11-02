<?php
/** Feasibility probe only: PHP's native tokenizer, NOT a complete PHP parser. */
$source = stream_get_contents(STDIN);
try {
    $raw = token_get_all($source, TOKEN_PARSE);
} catch (ParseError $error) {
    echo json_encode(['declarations'=>[], 'references'=>[], 'diagnostics'=>[['code'=>'PHP_PARSE_ERROR','message'=>$error->getMessage()]]], JSON_THROW_ON_ERROR);
    exit(0);
}
$tokens = [];
$offset = 0;
foreach ($raw as $token) {
    $text = is_array($token) ? $token[1] : $token;
    $kind = is_array($token) ? token_name($token[0]) : $text;
    $tokens[] = ['kind'=>$kind, 'text'=>$text, 'startByte'=>$offset, 'endByte'=>$offset + strlen($text)];
    $offset += strlen($text);
}
function nextSignificant(array $tokens, int $i): ?int {
    for ($j = $i + 1; $j < count($tokens); $j++) {
        if (!in_array($tokens[$j]['kind'], ['T_WHITESPACE','T_COMMENT','T_DOC_COMMENT'], true)) return $j;
    }
    return null;
}
function span(array $token): array { return ['startByte'=>$token['startByte'],'endByte'=>$token['endByte']]; }
$declarations = [];
$references = [];
$diagnostics = [];
$braceDepth = 0;
$scope = [];
$pending = null;
$namespace = '';
$pendingTraitAdaptation = false;
$traitAdaptationDepth = null;
for ($i=0; $i<count($tokens); $i++) {
    $t = $tokens[$i];
    if ($t['kind'] === 'T_NAMESPACE') {
        $k = nextSignificant($tokens,$i);
        if ($k !== null && in_array($tokens[$k]['kind'],['T_STRING','T_NAME_QUALIFIED'],true)) $namespace = $tokens[$k]['text'];
    }
    if (in_array($t['kind'], ['T_TRAIT','T_CLASS','T_INTERFACE'],true)) {
        $k = nextSignificant($tokens,$i);
        if ($k !== null && $tokens[$k]['kind'] === 'T_STRING') {
            $name = $tokens[$k]['text'];
            $kind = ['T_TRAIT'=>'trait','T_CLASS'=>'class','T_INTERFACE'=>'interface'][$t['kind']];
            $declarations[] = ['kind'=>$kind,'name'=>$name,'qualifiedName'=>($namespace!==''?$namespace.'\\':'').$name,
              'languageSyntaxKind'=>$t['kind'],'range'=>['startByte'=>$t['startByte'],'endByte'=>$tokens[$k]['endByte']]];
            $pending = ['kind'=>$kind,'name'=>$name];
        }
    }
    if ($t['kind']==='T_FUNCTION') {
        $k = nextSignificant($tokens,$i);
        if ($k !== null && $tokens[$k]['kind'] === '&') $k = nextSignificant($tokens,$k);
        if ($k !== null && $tokens[$k]['kind']==='T_STRING') {
            $current = count($scope)>0 ? $scope[count($scope)-1] : null;
            $owner = $current['name'] ?? null;
            $kind = $current !== null && in_array($current['kind'],['trait','class','interface'],true) ? 'method':'function';
            $name = $tokens[$k]['text'];
            $declarations[]=['kind'=>$kind,'name'=>$name,'qualifiedName'=>($namespace!==''?$namespace.'\\':'').($kind==='method'?$owner.'::':'').$name,
              'languageSyntaxKind'=>'T_FUNCTION','range'=>['startByte'=>$t['startByte'],'endByte'=>$tokens[$k]['endByte']]];
        }
    }
    if ($t['kind']==='T_USE') {
        $current = count($scope)>0 ? $scope[count($scope)-1] : null;
        if ($current !== null && in_array($current['kind'],['trait','class'],true)) {
            $k=nextSignificant($tokens,$i);
            if ($k!==null && in_array($tokens[$k]['kind'], ['T_STRING','T_NAME_QUALIFIED','T_NS_SEPARATOR'],true)) {
              $references[]=['role'=>'php.trait_use','spelling'=>$tokens[$k]['text'],'range'=>span($tokens[$k])];
              $pendingTraitAdaptation = true;
            }
        }
    }
    // Only a lexical occurrence; never claim that an alias resolves to a particular method.
    if ($t['kind']==='T_AS' && $traitAdaptationDepth!==null && $braceDepth===$traitAdaptationDepth) {
        $k=nextSignificant($tokens,$i);
        if ($k!==null && in_array($tokens[$k]['kind'],['T_PUBLIC','T_PRIVATE','T_PROTECTED'],true)) $k=nextSignificant($tokens,$k);
        if ($k!==null && $tokens[$k]['kind']==='T_STRING')
            $references[]=['role'=>'php.trait_adaptation','spelling'=>$tokens[$k]['text'],'range'=>span($tokens[$k])];
    }
    if (in_array($t['kind'], ['T_OBJECT_OPERATOR','T_NULLSAFE_OBJECT_OPERATOR'], true)) {
        $k = nextSignificant($tokens,$i);
        if ($k!==null && $tokens[$k]['kind']==='T_STRING') {
            $next=nextSignificant($tokens,$k);
            if ($next!==null && $tokens[$next]['kind']==='(')
                $references[]=['role'=>'call','spelling'=>$tokens[$k]['text'],'range'=>span($tokens[$k]),'resolutionStatus'=>'unresolved'];
        }
    }
    if ($pendingTraitAdaptation && $t['kind']===';') $pendingTraitAdaptation=false;
    if ($t['kind']==='{') {
        $braceDepth++;
        if ($pendingTraitAdaptation) { $traitAdaptationDepth=$braceDepth; $pendingTraitAdaptation=false; }
        if ($pending!==null) { $scope[]=['kind'=>$pending['kind'],'name'=>$pending['name'],'depth'=>$braceDepth]; $pending=null; }
    } elseif ($t['kind']==='}') {
        if ($traitAdaptationDepth===$braceDepth) $traitAdaptationDepth=null;
        if (count($scope)>0 && $scope[count($scope)-1]['depth']===$braceDepth) array_pop($scope);
        $braceDepth--;
    }
}
echo json_encode(['declarations'=>$declarations,'references'=>$references,'diagnostics'=>$diagnostics], JSON_THROW_ON_ERROR);
