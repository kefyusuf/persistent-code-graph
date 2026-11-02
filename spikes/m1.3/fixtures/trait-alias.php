<?php
namespace Example;
use Lib\Repository as RepositoryAlias;
trait Logger {
    public function emit(): void {}
}
class Handler {
    use Logger { emit as notice; }
    public function go(): void { $this->missing(); }
}
